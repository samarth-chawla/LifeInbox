import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to apply migrations");

const directory = new URL("../server/db/migrations/", import.meta.url);
const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
let migration = "migration setup";

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(148007205, 1)");
    await client.query(`CREATE SCHEMA IF NOT EXISTS lifeinbox;
      CREATE TABLE IF NOT EXISTS lifeinbox.schema_migrations (
        name text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    if (!files.length) throw new Error("No migration files found");
    for (const file of files) {
      migration = file;
      const sql = (await readFile(new URL(file, directory), "utf8")).replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT sha256 FROM lifeinbox.schema_migrations WHERE name = $1", [file]);
      if (previous.rowCount) {
        if (previous.rows[0].sha256 !== checksum) throw new Error("Applied migration checksum changed");
        continue;
      }

      await client.query(sql);
      await client.query("INSERT INTO lifeinbox.schema_migrations (name, sha256) VALUES ($1, $2)", [file, checksum]);
    }

    await client.query("COMMIT");
    console.log("LifeInbox migrations are up to date");
  } finally {
    // Releasing with destruction rolls back any uncommitted transaction.
    client.release(true);
  }
} catch (error) {
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? ` (SQLSTATE ${error.code})` : "";
  console.error(`LifeInbox migration failed at ${migration}${code}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
