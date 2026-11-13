import "server-only";
import { notesPageSize } from "../../lib/notes";
import { createItem } from "../db/items";
import { getPool } from "../db/pool";
import { enqueueUrlJob, retryUrlJob } from "../db/processing-jobs";
import { listSavedLinks, readSavedLink } from "../db/saved-links";
import { withTransaction } from "../db/transaction";
import { withTrialCreation } from "./trials";

export async function getLinks(ownerId: string, page: number) {
  const rows = await listSavedLinks(getPool(), ownerId, notesPageSize + 1, (page - 1) * notesPageSize);
  return { items: rows.slice(0, notesPageSize), page, hasMore: rows.length > notesPageSize };
}

export function getLink(ownerId: string, itemId: string) {
  return readSavedLink(getPool(), ownerId, itemId);
}

export function saveLink(ownerId: string, originalUrl: string, title: string) {
  return withTrialCreation(getPool(), ownerId, async (db) => {
    const item = await createItem(db, ownerId, { kind: "url", title, originalUrl });
    await enqueueUrlJob(db, ownerId, item.id, item.sourceRevision);
    const link = await readSavedLink(db, ownerId, item.id);
    if (!link) throw new Error("Created link was not found");
    return link;
  });
}

export function retryLink(ownerId: string, itemId: string) {
  return withTransaction(getPool(), async (db) => {
    const owner = await db.query("SELECT 1 FROM lifeinbox.owners WHERE id = $1 AND active FOR UPDATE", [ownerId]);
    if (!owner.rowCount) return { code: "ACCOUNT_UNAVAILABLE", status: 403 } as const;
    if (!await readSavedLink(db, ownerId, itemId)) return { code: "ITEM_NOT_FOUND", status: 404 } as const;
    if (!await retryUrlJob(db, ownerId, itemId)) return { code: "RETRY_UNAVAILABLE", status: 409 } as const;
    return { item: await readSavedLink(db, ownerId, itemId), status: 202 } as const;
  });
}

export function removeLink(ownerId: string, itemId: string) {
  return withTransaction(getPool(), async (db) => {
    const owner = await db.query("SELECT 1 FROM lifeinbox.owners WHERE id = $1 AND active FOR UPDATE", [ownerId]);
    if (!owner.rowCount) return "ACCOUNT_UNAVAILABLE" as const;
    const result = await db.query(
      "DELETE FROM lifeinbox.items WHERE owner_id = $1 AND id = $2 AND kind = 'url'",
      [ownerId, itemId],
    );
    return result.rowCount ? "DELETED" as const : "ITEM_NOT_FOUND" as const;
  });
}
