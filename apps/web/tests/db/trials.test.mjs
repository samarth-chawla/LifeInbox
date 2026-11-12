import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createItem, readItem } from "../../server/db/items.ts";
import { readAccountTrial, withTrialCreation } from "../../server/services/trials.ts";

test("Phase 3 trial policy against PostgreSQL", async (t) => {
  const connectionString = process.env.LIFEINBOX_TEST_DATABASE_URL;
  assert.ok(connectionString, "Set LIFEINBOX_TEST_DATABASE_URL to a dedicated migrated database");
  const db = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  t.after(() => db.end());
  const { rows: [database] } = await db.query("SELECT current_database() AS name");
  assert.match(database.name, /_test$/, "Use a disposable database whose name ends in _test");
  process.env.TRIAL_STORAGE_ALLOWANCE_BYTES = "100";

  async function createOwner() {
    const { rows: [owner] } = await db.query("INSERT INTO lifeinbox.owners DEFAULT VALUES RETURNING id");
    return owner.id;
  }

  await t.test("concurrent initialization records a single start and snapshots the allowance", async () => {
    const ownerId = await createOwner();
    const [first, second] = await Promise.all([readAccountTrial(db, ownerId), readAccountTrial(db, ownerId)]);
    assert.deepEqual(first, second);
    assert.equal(Date.parse(first.trial.deadline) - Date.parse(first.trial.startedAt), 7 * 24 * 60 * 60 * 1000);
    assert.equal(first.trial.allowanceBytes, 100);
    process.env.TRIAL_STORAGE_ALLOWANCE_BYTES = "200";
    assert.deepEqual(await readAccountTrial(db, ownerId), first);
    assert.equal((await readAccountTrial(db, await createOwner())).trial.allowanceBytes, 200);
    process.env.TRIAL_STORAGE_ALLOWANCE_BYTES = "100";
  });

  await t.test("time expiry blocks creation and finalization while preserving reads", async () => {
    const ownerId = await createOwner();
    const item = { kind: "note", title: "Kept note", noteText: "Keep me." };
    const created = await withTrialCreation(db, ownerId, (tx) => createItem(tx, ownerId, item));
    assert.equal(created.allowed, true);
    await db.query("UPDATE lifeinbox.storage_usage SET reserved_bytes = 40 WHERE owner_id = $1", [ownerId]);
    await db.query(
      `UPDATE lifeinbox.owner_trials
       SET started_at = now() - interval '168 hours', deadline = now()
       WHERE owner_id = $1`,
      [ownerId],
    );
    await assert.rejects(db.query(
      "UPDATE lifeinbox.storage_usage SET reserved_bytes = 0, confirmed_bytes = 40 WHERE owner_id = $1",
      [ownerId],
    ), { constraint: "storage_usage_trial_active" });
    const denied = await withTrialCreation(db, ownerId, () => assert.fail("Creation should not run"));
    assert.equal(denied.reason, "TRIAL_ENDED");
    assert.equal(denied.trial.endReason, "time");
    assert.equal(denied.trial.endedAt, denied.trial.deadline);
    assert.equal(denied.trial.reservedBytes, 40);
    await db.query("UPDATE lifeinbox.storage_usage SET reserved_bytes = 0 WHERE owner_id = $1", [ownerId]);
    assert.equal((await readAccountTrial(db, ownerId)).trial.reservedBytes, 0);
    assert.equal((await readItem(db, ownerId, created.value.id)).noteText, item.noteText);
  });

  await t.test("reservation does not end the trial, but confirmed bytes at the cap do", async () => {
    const ownerId = await createOwner();
    await readAccountTrial(db, ownerId);
    await db.query("UPDATE lifeinbox.storage_usage SET reserved_bytes = 100 WHERE owner_id = $1", [ownerId]);
    assert.equal((await readAccountTrial(db, ownerId)).trial.status, "active");
    await assert.rejects(db.query(
      "UPDATE lifeinbox.storage_usage SET reserved_bytes = 101 WHERE owner_id = $1", [ownerId],
    ), { constraint: "storage_usage_trial_allowance" });
    await assert.rejects(withTrialCreation(db, ownerId, async (tx) => {
      await tx.query(
        "UPDATE lifeinbox.storage_usage SET reserved_bytes = 0, confirmed_bytes = 100 WHERE owner_id = $1", [ownerId],
      );
      throw new Error("Simulated finalization failure");
    }), /Simulated finalization failure/);
    const active = (await readAccountTrial(db, ownerId)).trial;
    assert.equal(active.status, "active");
    assert.equal(active.confirmedBytes, 0);
    assert.equal(active.reservedBytes, 100);
    const finalized = await withTrialCreation(db, ownerId, (tx) => tx.query(
      "UPDATE lifeinbox.storage_usage SET reserved_bytes = 0, confirmed_bytes = 100 WHERE owner_id = $1", [ownerId],
    ));
    assert.equal(finalized.allowed, true);
    const ended = (await readAccountTrial(db, ownerId)).trial;
    assert.equal(ended.confirmedBytes, 100);
    assert.equal(ended.endReason, "storage");
    assert.ok(Date.parse(ended.endedAt) < Date.parse(ended.deadline));
    await db.query("UPDATE lifeinbox.storage_usage SET confirmed_bytes = 0 WHERE owner_id = $1", [ownerId]);
    const afterCleanup = (await readAccountTrial(db, ownerId)).trial;
    assert.equal(afterCleanup.status, "ended");
    assert.equal(afterCleanup.endedAt, ended.endedAt);
    assert.equal(afterCleanup.endReason, "storage");
  });

  await t.test("concurrent reservations respect headroom and inactive owners cannot write", async () => {
    const ownerId = await createOwner();
    await readAccountTrial(db, ownerId);
    const reserve = () => withTrialCreation(db, ownerId, (tx) => tx.query(
      "UPDATE lifeinbox.storage_usage SET reserved_bytes = reserved_bytes + 60 WHERE owner_id = $1", [ownerId],
    ));
    const attempts = await Promise.allSettled([reserve(), reserve()]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.find((attempt) => attempt.status === "rejected").reason.constraint, "storage_usage_trial_allowance");
    assert.equal((await readAccountTrial(db, ownerId)).trial.reservedBytes, 60);
    await db.query("UPDATE lifeinbox.owners SET active = false WHERE id = $1", [ownerId]);
    assert.equal(await readAccountTrial(db, ownerId), null);
    const denied = await withTrialCreation(db, ownerId, () => assert.fail("Creation should not run"));
    assert.equal(denied.reason, "ACCOUNT_UNAVAILABLE");
  });
});
