import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createItem, listItems, readItem, renameItem } from "../../server/db/items.ts";
import { readOwnerSettings, setExternalAiEnabled } from "../../server/db/owner-settings.ts";
import { attachTag, getOrCreateTag, listItemTags } from "../../server/db/tags.ts";
import { withTransaction } from "../../server/db/transaction.ts";

test("Phase 2 repositories and ownership constraints against PostgreSQL", async (t) => {
  const connectionString = process.env.LIFEINBOX_TEST_DATABASE_URL;
  assert.ok(connectionString, "Set LIFEINBOX_TEST_DATABASE_URL to a dedicated migrated database");
  const db = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  t.after(() => db.end());

  const database = await db.query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /_test$/, "Use a disposable database whose name ends in _test");

  const owners = await db.query("INSERT INTO lifeinbox.owners (active) VALUES (true), (true) RETURNING id");
  const [first, second] = owners.rows.map((row) => row.id);
  const note = await createItem(db, first, { kind: "note", title: "My note", noteText: "Remember this." });
  const url = await createItem(db, second, {
    kind: "url", title: "Saved article", originalUrl: "https://example.test/article?q=original",
  });

  await t.test("item reads, listings and writes require the owning ID", async () => {
    assert.equal((await readItem(db, first, note.id)).noteText, "Remember this.");
    assert.equal((await readItem(db, second, url.id)).originalUrl, url.originalUrl);
    assert.equal(await readItem(db, second, note.id), null);
    assert.deepEqual((await listItems(db, second, 10)).map((item) => item.id), [url.id]);
    assert.equal(await renameItem(db, second, note.id, "Wrong owner"), null);
    const title = "What's next?";
    const renamed = await renameItem(db, first, note.id, title);
    assert.equal(renamed.title, title);
    assert.equal(renamed.sourceRevision, 1);
    assert.equal((await readItem(db, first, note.id)).title, title);
    await assert.rejects(createItem(db, first, { kind: "note", title, noteText: "" }), { code: "23514" });
  });

  await t.test("settings default external AI to off and update per owner", async () => {
    assert.deepEqual(await readOwnerSettings(db, first), { externalAiEnabled: false });
    assert.deepEqual(await setExternalAiEnabled(db, first, true), { externalAiEnabled: true });
    assert.deepEqual(await readOwnerSettings(db, first), { externalAiEnabled: true });
    assert.deepEqual(await readOwnerSettings(db, second), { externalAiEnabled: false });
    assert.deepEqual(await setExternalAiEnabled(db, first, false), { externalAiEnabled: false });
  });

  await t.test("duplicate tags and assignments converge while mixed-owner relations fail", async () => {
    const tags = await Promise.all(Array.from({ length: 4 }, () => getOrCreateTag(db, first, " Reading ")));
    const tag = tags[0];
    assert.equal(tag.name, "Reading");
    assert.equal(new Set(tags.map((row) => row.id)).size, 1);
    const otherTag = await getOrCreateTag(db, second, "Reading");
    assert.notEqual(otherTag.id, tag.id);

    await assert.rejects(attachTag(db, first, note.id, otherTag.id), { code: "23503" });
    await assert.rejects(attachTag(db, first, url.id, tag.id), { code: "23503" });
    await Promise.all(Array.from({ length: 4 }, () => attachTag(db, first, note.id, tag.id)));
    assert.deepEqual(await listItemTags(db, first, note.id), [tag]);
    assert.deepEqual(await listItemTags(db, second, note.id), []);
  });

  await t.test("a failed relationship rolls back earlier item and tag writes", async () => {
    await assert.rejects(withTransaction(db, async (tx) => {
      const item = await createItem(tx, first, { kind: "note", title: "Rolled back", noteText: "Discard." });
      const tag = await getOrCreateTag(tx, second, "Rolled back");
      await attachTag(tx, first, item.id, tag.id);
    }), { code: "23503" });
    assert.deepEqual((await listItems(db, first, 10)).map((item) => item.id), [note.id]);
    const tags = await db.query("SELECT id FROM lifeinbox.tags WHERE owner_id = $1 AND name = $2", [second, "Rolled back"]);
    assert.equal(tags.rowCount, 0);
  });

  await t.test("a successful transaction commits all related writes", async () => {
    const { item, tag } = await withTransaction(db, async (tx) => {
      const item = await createItem(tx, first, { kind: "note", title: "Committed", noteText: "Keep." });
      const tag = await getOrCreateTag(tx, first, "Committed");
      await attachTag(tx, first, item.id, tag.id);
      return { item, tag };
    });
    assert.deepEqual(await readItem(db, first, item.id), item);
    assert.deepEqual(await listItemTags(db, first, item.id), [tag]);
    assert.equal((await listItems(db, first, 1))[0].id, item.id);
  });
});
