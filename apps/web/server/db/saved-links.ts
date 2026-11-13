import "server-only";
import type { SavedLink, SavedLinkSummary } from "../../lib/saved-links.ts";
import type { DatabaseQuery } from "./transaction.ts";

const summaryColumns = `i.id, i.kind, i.title, i.original_url AS "originalUrl", i.created_at AS "createdAt",
  i.updated_at AS "updatedAt", COALESCE(j.status, 'failed') AS status,
  CASE WHEN j.status IS NULL THEN 'JOB_UNAVAILABLE' ELSE j.error_code END AS "errorCode",
  COALESCE(j.status = 'failed' AND j.manual_retries < 2 AND
    j.error_code NOT IN ('SOURCE_BLOCKED', 'UNSUPPORTED_RESPONSE', 'NO_TEXT', 'RESPONSE_TOO_LARGE'), false) AS "canRetry"`;

const linkJobJoin = `FROM lifeinbox.items i
  LEFT JOIN lifeinbox.processing_jobs j ON j.owner_id = i.owner_id AND j.item_id = i.id
    AND j.source_revision = i.source_revision AND j.kind = 'url_extract'`;

type DateRow<T extends SavedLinkSummary> = Omit<T, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };

function serialize<T extends DateRow<SavedLinkSummary>>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function readSavedLink(db: DatabaseQuery, ownerId: string, id: string): Promise<SavedLink | null> {
  const { rows: [row] } = await db.query<DateRow<SavedLink>>(
    `SELECT ${summaryColumns}, i.extracted_title AS "extractedTitle",
            i.extracted_description AS description, i.extracted_text AS "extractedText"
     ${linkJobJoin} WHERE i.owner_id = $1 AND i.id = $2 AND i.kind = 'url'`,
    [ownerId, id],
  );
  return row ? serialize(row) : null;
}

export async function listSavedLinks(db: DatabaseQuery, ownerId: string, limit: number, offset: number) {
  const { rows } = await db.query<DateRow<SavedLinkSummary>>(
    `SELECT ${summaryColumns} ${linkJobJoin}
     WHERE i.owner_id = $1 AND i.kind = 'url'
     ORDER BY i.created_at DESC, i.id DESC LIMIT $2 OFFSET $3`,
    [ownerId, limit, offset],
  );
  return rows.map(serialize);
}
