import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createItem } from "../../server/db/items.ts";
import { claimUrlJob, enqueueUrlJob, finishUrlJob, retryUrlJob } from "../../server/db/processing-jobs.ts";
import { readSavedLink } from "../../server/db/saved-links.ts";

test("URL jobs against PostgreSQL", async (t) => {
  const connectionString = process.env.LIFEINBOX_TEST_DATABASE_URL;
  assert.ok(connectionString, "Set LIFEINBOX_TEST_DATABASE_URL to a dedicated migrated database");
  const db = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  let fixtureOwners = [];
  t.after(async () => {
    try {
      await db.query("DELETE FROM lifeinbox.items WHERE owner_id = ANY($1::uuid[])", [fixtureOwners]);
      await db.query("DELETE FROM lifeinbox.owners WHERE id = ANY($1::uuid[])", [fixtureOwners]);
    } finally {
      await db.end();
    }
  });
  const { rows: [database] } = await db.query("SELECT current_database() AS name");
  assert.match(database.name, /_test$/);
  const { rows: [first, second] } = await db.query("INSERT INTO lifeinbox.owners (active) VALUES (true), (true) RETURNING id");
  fixtureOwners = [first.id, second.id];
  const originalUrl = "https://example.org/article#section";
  const item = await createItem(db, first.id, { kind: "url", title: "Saved title", originalUrl });
  await enqueueUrlJob(db, first.id, item.id, item.sourceRevision);
  await enqueueUrlJob(db, first.id, item.id, item.sourceRevision);
  const [one, two] = await Promise.all([claimUrlJob(db), claimUrlJob(db)]);
  assert.ok(one || two);
  assert.ok(!one || !two);
  const firstLease = one ?? two;
  assert.equal(firstLease.itemId, item.id);
  assert.equal(await readSavedLink(db, second.id, item.id), null);

  const key = [first.id, item.id];
  const expireLease = () => db.query(
    "UPDATE lifeinbox.processing_jobs SET lease_expires_at = now() - interval '1 second' WHERE owner_id = $1 AND item_id = $2",
    key,
  );
  await expireLease();
  const secondLease = await claimUrlJob(db);
  assert.equal(secondLease.attempt, 2);
  const output = { title: "Extracted title", description: "Description", text: "Extracted content" };
  assert.equal(await finishUrlJob(db, firstLease, output), false);
  assert.equal(await finishUrlJob(db, secondLease, { code: "HTTP_ERROR", transient: true }), true);
  assert.equal((await readSavedLink(db, first.id, item.id)).status, "queued");
  await db.query("UPDATE lifeinbox.processing_jobs SET available_at = now() WHERE owner_id = $1 AND item_id = $2", key);
  const finalLease = await claimUrlJob(db);
  assert.equal(finalLease.attempt, 3);
  await expireLease();
  assert.equal(await claimUrlJob(db), null);
  const failed = await readSavedLink(db, first.id, item.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "LEASE_EXPIRED");
  assert.equal(failed.originalUrl, originalUrl);
  assert.equal(await retryUrlJob(db, second.id, item.id), false);
  const retries = await Promise.all([retryUrlJob(db, first.id, item.id), retryUrlJob(db, first.id, item.id)]);
  assert.deepEqual(retries.sort(), [false, true]);

  const stale = await claimUrlJob(db);
  await db.query("UPDATE lifeinbox.items SET source_revision = 2 WHERE owner_id = $1 AND id = $2", key);
  assert.equal(await finishUrlJob(db, stale, output), false);
  assert.equal((await readSavedLink(db, first.id, item.id)).extractedText, null);
  await enqueueUrlJob(db, first.id, item.id, 2);
  const current = await claimUrlJob(db);
  assert.equal(await finishUrlJob(db, current, output), true);
  assert.equal(await finishUrlJob(db, current, output), false);
  const saved = await readSavedLink(db, first.id, item.id);
  assert.equal(saved.title, "Saved title");
  assert.equal(saved.extractedTitle, output.title);
  assert.equal(saved.extractedText, output.text);
  assert.equal(saved.status, "succeeded");
});
