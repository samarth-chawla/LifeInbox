import "server-only";
import type { DatabaseQuery } from "./transaction";

const durationSeconds = 7 * 24 * 60 * 60;

type TrialRow = {
  startedAt: Date;
  deadline: Date;
  durationSeconds: number;
  allowanceBytes: string;
  confirmedBytes: string;
  reservedBytes: string;
  endedAt: Date | null;
  endReason: "time" | "storage" | null;
};

// Call inside a transaction after locking the active owner.
export async function resolveTrial(db: DatabaseQuery, ownerId: string, initialAllowance: () => number) {
  const existing = await db.query("SELECT 1 FROM lifeinbox.owner_trials WHERE owner_id = $1", [ownerId]);
  if (existing.rowCount === 0) {
    await db.query(
      `INSERT INTO lifeinbox.owner_trials (owner_id, started_at, duration_seconds, deadline, allowance_bytes)
       SELECT $1, start.at, $2::integer, start.at + $2::integer * interval '1 second', $3
         FROM (SELECT clock_timestamp() AS at) AS start`,
      [ownerId, durationSeconds, initialAllowance()],
    );
    await db.query("INSERT INTO lifeinbox.storage_usage (owner_id) VALUES ($1)", [ownerId]);
  }

  await db.query(
    `UPDATE lifeinbox.owner_trials SET ended_at = deadline, end_reason = 'time'
     WHERE owner_id = $1 AND ended_at IS NULL AND deadline <= clock_timestamp()`,
    [ownerId],
  );
  const { rows: [row] } = await db.query<TrialRow>(
    `SELECT t.started_at AS "startedAt", t.deadline, t.duration_seconds AS "durationSeconds",
            t.allowance_bytes AS "allowanceBytes", u.confirmed_bytes AS "confirmedBytes",
            u.reserved_bytes AS "reservedBytes", t.ended_at AS "endedAt", t.end_reason AS "endReason"
       FROM lifeinbox.owner_trials t
       JOIN lifeinbox.storage_usage u ON u.owner_id = t.owner_id
      WHERE t.owner_id = $1`,
    [ownerId],
  );
  if (!row) throw new Error("LifeInbox trial has no storage usage row");

  return {
    startedAt: row.startedAt.toISOString(),
    deadline: row.deadline.toISOString(),
    durationSeconds: row.durationSeconds,
    allowanceBytes: Number(row.allowanceBytes),
    confirmedBytes: Number(row.confirmedBytes),
    reservedBytes: Number(row.reservedBytes),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason,
    status: row.endedAt ? "ended" as const : "active" as const,
  };
}
