import "server-only";
import type { Pool } from "pg";
import { withTransaction, type DatabaseQuery } from "./transaction.ts";

export type UrlJob = {
  ownerId: string;
  itemId: string;
  sourceRevision: number;
  originalUrl: string;
  attempt: number;
  leaseToken: string;
};

type ExtractionOutcome =
  | { title: string | null; description: string | null; text: string }
  | { code: string; transient: boolean };

export async function enqueueUrlJob(db: DatabaseQuery, ownerId: string, itemId: string, revision: number) {
  await db.query(
    `INSERT INTO lifeinbox.processing_jobs (owner_id, item_id, kind, source_revision)
     VALUES ($1, $2, 'url_extract', $3) ON CONFLICT DO NOTHING`,
    [ownerId, itemId, revision],
  );
}

export async function claimUrlJob(db: DatabaseQuery) {
  const { rows: [job] } = await db.query<UrlJob>(
    `WITH exhausted AS (
       SELECT owner_id, item_id, source_revision FROM lifeinbox.processing_jobs
       WHERE kind = 'url_extract' AND status = 'running' AND lease_expires_at <= clock_timestamp() AND attempt = 3
       ORDER BY lease_expires_at LIMIT 20 FOR UPDATE SKIP LOCKED
     ), reaped AS (
       UPDATE lifeinbox.processing_jobs j
       SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
           error_code = 'LEASE_EXPIRED', updated_at = clock_timestamp()
       FROM exhausted e
       WHERE j.owner_id = e.owner_id AND j.item_id = e.item_id AND j.source_revision = e.source_revision
         AND j.kind = 'url_extract'
     ), ready AS (
       SELECT j.owner_id, j.item_id, j.source_revision, i.original_url
       FROM lifeinbox.processing_jobs j
       JOIN lifeinbox.items i ON i.owner_id = j.owner_id AND i.id = j.item_id AND i.source_revision = j.source_revision
       JOIN lifeinbox.owners o ON o.id = j.owner_id AND o.active
       WHERE i.kind = 'url' AND j.kind = 'url_extract' AND j.attempt < 3 AND
         ((j.status = 'queued' AND j.available_at <= clock_timestamp()) OR
          (j.status = 'running' AND j.lease_expires_at <= clock_timestamp()))
       ORDER BY j.available_at, j.created_at, j.owner_id, j.item_id
       LIMIT 1 FOR UPDATE OF j SKIP LOCKED
     )
     UPDATE lifeinbox.processing_jobs j
     SET status = 'running', attempt = j.attempt + 1, error_code = NULL, lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '45 seconds', updated_at = clock_timestamp()
     FROM ready r
     WHERE j.owner_id = r.owner_id AND j.item_id = r.item_id AND j.source_revision = r.source_revision
       AND j.kind = 'url_extract'
     RETURNING j.owner_id AS "ownerId", j.item_id AS "itemId", j.source_revision AS "sourceRevision",
               r.original_url AS "originalUrl", j.attempt, j.lease_token AS "leaseToken"`,
  );
  return job ?? null;
}

export function finishUrlJob(pool: Pool, job: UrlJob, result: ExtractionOutcome) {
  return withTransaction(pool, async (db) => {
    const { rowCount: owner } = await db.query(
      "SELECT 1 FROM lifeinbox.owners WHERE id = $1 AND active FOR UPDATE",
      [job.ownerId],
    );
    if (!owner) return false;
    const { rowCount: current } = await db.query(
      `SELECT 1 FROM lifeinbox.items WHERE owner_id = $1 AND id = $2 AND source_revision = $3
        AND original_url = $4 AND kind = 'url' FOR UPDATE`,
      [job.ownerId, job.itemId, job.sourceRevision, job.originalUrl],
    );
    if (!current) return false;
    const retry = "code" in result && result.transient && job.attempt < 3;
    const status = "code" in result ? (retry ? "queued" : "failed") : "succeeded";
    const { rowCount: finished } = await db.query(
      `UPDATE lifeinbox.processing_jobs
          SET status = $5, error_code = $6, lease_token = NULL, lease_expires_at = NULL,
              available_at = clock_timestamp() + $7::integer * interval '1 second', updated_at = clock_timestamp()
        WHERE owner_id = $1 AND item_id = $2 AND source_revision = $3 AND kind = 'url_extract'
          AND status = 'running' AND lease_token = $4 AND lease_expires_at > clock_timestamp()`,
      [job.ownerId, job.itemId, job.sourceRevision, job.leaseToken, status, "code" in result ? result.code : null,
        retry ? job.attempt * 5 : 0],
    );
    if (!finished) return false;
    if (!("code" in result)) {
      await db.query(
        `UPDATE lifeinbox.items SET extracted_title = $4, extracted_description = $5, extracted_text = $6
         WHERE owner_id = $1 AND id = $2 AND source_revision = $3`,
        [job.ownerId, job.itemId, job.sourceRevision, result.title, result.description, result.text],
      );
    }
    return true;
  });
}

export async function retryUrlJob(db: DatabaseQuery, ownerId: string, itemId: string) {
  const result = await db.query(
    `UPDATE lifeinbox.processing_jobs j
     SET status = 'queued', attempt = 0, manual_retries = j.manual_retries + 1, error_code = NULL,
         available_at = clock_timestamp(), updated_at = clock_timestamp()
     FROM lifeinbox.items i
     WHERE j.owner_id = $1 AND j.item_id = $2 AND j.kind = 'url_extract' AND j.status = 'failed'
       AND j.manual_retries < 2 AND j.error_code NOT IN ('SOURCE_BLOCKED', 'UNSUPPORTED_RESPONSE', 'NO_TEXT', 'RESPONSE_TOO_LARGE')
       AND i.owner_id = j.owner_id AND i.id = j.item_id AND i.source_revision = j.source_revision AND i.kind = 'url'`,
    [ownerId, itemId],
  );
  return result.rowCount === 1;
}
