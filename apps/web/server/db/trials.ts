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

const trialColumns = `t.started_at AS "startedAt", t.deadline, t.duration_seconds AS "durationSeconds",
  t.allowance_bytes AS "allowanceBytes", u.confirmed_bytes AS "confirmedBytes",
  u.reserved_bytes AS "reservedBytes", t.ended_at AS "endedAt", t.end_reason AS "endReason"`;

function serializeTrial(row: TrialRow) {
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

export async function readCurrentAccountTrial(db: DatabaseQuery, ownerId: string) {
  const { rows: [row] } = await db.query<TrialRow & { createdAt: Date }>(
    `SELECT o.created_at AS "createdAt", ${trialColumns}
       FROM lifeinbox.owners o
       JOIN lifeinbox.owner_trials t ON t.owner_id = o.id
       JOIN lifeinbox.storage_usage u ON u.owner_id = o.id
      WHERE o.id = $1 AND o.active AND (t.ended_at IS NOT NULL OR t.deadline > clock_timestamp())`,
    [ownerId],
  );
  return row ? { ownerId, createdAt: row.createdAt.toISOString(), trial: serializeTrial(row) } : null;
}

async function readOrExpireTrial(db: DatabaseQuery, ownerId: string) {
  const { rows: [row] } = await db.query<TrialRow>(
    `WITH expired AS (
       UPDATE lifeinbox.owner_trials SET ended_at = deadline, end_reason = 'time'
        WHERE owner_id = $1 AND ended_at IS NULL AND deadline <= clock_timestamp()
       RETURNING *
     )
     SELECT ${trialColumns}
       FROM (
         SELECT * FROM expired
         UNION ALL
         SELECT * FROM lifeinbox.owner_trials WHERE owner_id = $1 AND NOT EXISTS (SELECT 1 FROM expired)
       ) t
       JOIN lifeinbox.storage_usage u ON u.owner_id = t.owner_id`,
    [ownerId],
  );
  return row ? serializeTrial(row) : null;
}

// Call inside a transaction after locking the active owner.
export async function resolveTrial(db: DatabaseQuery, ownerId: string, initialAllowance: () => number) {
  const current = await readOrExpireTrial(db, ownerId);
  if (current) return current;

  await db.query(
    `INSERT INTO lifeinbox.owner_trials (owner_id, started_at, duration_seconds, deadline, allowance_bytes)
     SELECT $1, start.at, $2::integer, start.at + $2::integer * interval '1 second', $3
       FROM (SELECT clock_timestamp() AS at) AS start`,
    [ownerId, durationSeconds, initialAllowance()],
  );
  await db.query("INSERT INTO lifeinbox.storage_usage (owner_id) VALUES ($1)", [ownerId]);
  const initialized = await readOrExpireTrial(db, ownerId);
  if (!initialized) throw new Error("LifeInbox trial has no storage usage row");
  return initialized;
}
