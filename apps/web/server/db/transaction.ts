import "server-only";
import type { Pool, PoolClient } from "pg";

export type DatabaseQuery = Pick<PoolClient, "query">;

export async function withTransaction<T>(pool: Pool, work: (db: DatabaseQuery) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const value = await work(client);
    const result = await client.query("COMMIT");
    if (result.command !== "COMMIT") throw new Error("PostgreSQL did not commit the transaction");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
