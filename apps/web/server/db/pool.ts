import "server-only";
import { Pool } from "pg";
import { getEnv } from "../env";

const globalForPostgres = globalThis as typeof globalThis & { lifeInboxPool?: Pool };

export function getPool() {
  if (!globalForPostgres.lifeInboxPool) {
    const pool = new Pool({
      connectionString: getEnv().databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });

    pool.on("error", () => console.error("LifeInbox PostgreSQL idle connection failed"));
    globalForPostgres.lifeInboxPool = pool;
  }

  return globalForPostgres.lifeInboxPool;
}
