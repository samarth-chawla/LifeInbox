import "server-only";
import { PostgresDialect } from "kysely";
import type { Pool } from "pg";

export function authPersistence(pool: Pool) {
  return {
    database: {
      dialect: new PostgresDialect({ pool }),
      type: "postgres",
      schemaName: "auth",
      transaction: true,
    },
    rateLimit: { enabled: true, storage: "database" },
  } as const;
}
