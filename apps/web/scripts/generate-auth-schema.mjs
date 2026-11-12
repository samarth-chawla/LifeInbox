import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { authPersistence } from "../server/auth-schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to an empty PostgreSQL database");

const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
try {
  const migrations = await getMigrations(authPersistence(pool));
  console.log(await migrations.compileMigrations());
} catch {
  console.error("Better Auth schema generation failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
