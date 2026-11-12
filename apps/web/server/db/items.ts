import "server-only";
import type { CaptureKind } from "@lifeinbox/types";
import type { DatabaseQuery } from "./transaction";

type NewItem = { title: string } & (
  | { kind: "note"; noteText: string }
  | { kind: "url"; originalUrl: string }
  | { kind: "image" | "pdf" | "document" }
);

type Item = {
  id: string;
  kind: CaptureKind;
  title: string;
  noteText: string | null;
  originalUrl: string | null;
  sourceRevision: number;
  createdAt: Date;
  updatedAt: Date;
};

const itemColumns = `id, kind, title, note_text AS "noteText", original_url AS "originalUrl",
  source_revision AS "sourceRevision", created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function createItem(db: DatabaseQuery, ownerId: string, item: NewItem) {
  const result = await db.query<Item>(
    `INSERT INTO lifeinbox.items (owner_id, kind, title, note_text, original_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${itemColumns}`,
    [
      ownerId, item.kind, item.title,
      item.kind === "note" ? item.noteText : null,
      item.kind === "url" ? item.originalUrl : null,
    ],
  );
  return result.rows[0];
}

export async function readItem(db: DatabaseQuery, ownerId: string, itemId: string) {
  const result = await db.query<Item>(
    `SELECT ${itemColumns} FROM lifeinbox.items WHERE owner_id = $1 AND id = $2`,
    [ownerId, itemId],
  );
  return result.rows[0] ?? null;
}

export async function listItems(db: DatabaseQuery, ownerId: string, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Item limit must be a positive integer");
  const result = await db.query<Item>(
    `SELECT ${itemColumns} FROM lifeinbox.items WHERE owner_id = $1
     ORDER BY created_at DESC, id DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows;
}

export async function renameItem(db: DatabaseQuery, ownerId: string, itemId: string, title: string) {
  const result = await db.query<Item>(
    `UPDATE lifeinbox.items SET title = $3, updated_at = now()
     WHERE owner_id = $1 AND id = $2 RETURNING ${itemColumns}`,
    [ownerId, itemId, title],
  );
  return result.rows[0] ?? null;
}
