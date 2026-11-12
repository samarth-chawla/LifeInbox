import "server-only";
import type { Pool } from "pg";
import { resolveTrial } from "../db/trials.ts";
import { withTransaction, type DatabaseQuery } from "../db/transaction.ts";
import { getTrialAllowanceBytes } from "../env.ts";

type Trial = Awaited<ReturnType<typeof resolveTrial>>;

async function withOwnerTrial<T>(
  pool: Pool,
  ownerId: string,
  work: (db: DatabaseQuery, trial: Trial, createdAt: Date) => Promise<T>,
) {
  return withTransaction(pool, async (db) => {
    const { rows: [owner] } = await db.query<{ createdAt: Date }>(
      'SELECT created_at AS "createdAt" FROM lifeinbox.owners WHERE id = $1 AND active FOR UPDATE',
      [ownerId],
    );
    if (!owner) return null;
    return work(db, await resolveTrial(db, ownerId, getTrialAllowanceBytes), owner.createdAt);
  });
}

export function readAccountTrial(pool: Pool, ownerId: string) {
  return withOwnerTrial(pool, ownerId, async (_db, trial, createdAt) => ({
    ownerId, createdAt: createdAt.toISOString(), trial,
  }));
}

export async function withTrialCreation<T>(
  pool: Pool,
  ownerId: string,
  work: (db: DatabaseQuery, trial: Trial) => Promise<T>,
) {
  const result = await withOwnerTrial(pool, ownerId, async (db, trial) => {
    if (trial.status === "ended") return { allowed: false, reason: "TRIAL_ENDED", trial } as const;
    return { allowed: true, value: await work(db, trial) } as const;
  });
  return result ?? { allowed: false, reason: "ACCOUNT_UNAVAILABLE" } as const;
}
