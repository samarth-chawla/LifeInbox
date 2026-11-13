import "server-only";
import type { NotePatch } from "../../lib/notes";
import type { DatabaseQuery } from "./transaction";

type NoteSummary = { id: string; kind: "note"; title: string; updatedAt: Date };
type Note = NoteSummary & { noteText: string; tags: string[]; sourceRevision: number; createdAt: Date };

export async function listNoteSummaries(db: DatabaseQuery, ownerId: string, limit: number, offset: number) {
  const result = await db.query<NoteSummary>(
    `SELECT id, kind, title, updated_at AS "updatedAt"
       FROM lifeinbox.items
      WHERE owner_id = $1 AND kind = 'note'
      ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [ownerId, limit, offset],
  );
  return result.rows;
}

export async function readNote(db: DatabaseQuery, ownerId: string, noteId: string) {
  const result = await db.query<Note>(
    `SELECT i.id, i.kind, i.title, i.note_text AS "noteText", i.source_revision AS "sourceRevision",
            i.created_at AS "createdAt", i.updated_at AS "updatedAt",
            ARRAY(
              SELECT t.name FROM lifeinbox.item_tags it
              JOIN lifeinbox.tags t ON t.owner_id = it.owner_id AND t.id = it.tag_id
              WHERE it.owner_id = i.owner_id AND it.item_id = i.id ORDER BY t.name, t.id
            ) AS tags
       FROM lifeinbox.items i
      WHERE i.owner_id = $1 AND i.id = $2 AND i.kind = 'note'`,
    [ownerId, noteId],
  );
  return result.rows[0] ?? null;
}

export async function updateNote(db: DatabaseQuery, ownerId: string, noteId: string, patch: NotePatch) {
  const result = await db.query(
    `UPDATE lifeinbox.items
        SET title = COALESCE($3, title), note_text = COALESCE($4::text, note_text), updated_at = clock_timestamp(),
            source_revision = source_revision + CASE WHEN $4::text IS NOT NULL AND note_text <> $4 THEN 1 ELSE 0 END
      WHERE owner_id = $1 AND id = $2 AND kind = 'note'`,
    [ownerId, noteId, patch.title ?? null, patch.noteText ?? null],
  );
  return result.rowCount === 1;
}

export async function deleteNote(db: DatabaseQuery, ownerId: string, noteId: string) {
  const result = await db.query(
    "DELETE FROM lifeinbox.items WHERE owner_id = $1 AND id = $2 AND kind = 'note'",
    [ownerId, noteId],
  );
  return result.rowCount === 1;
}
