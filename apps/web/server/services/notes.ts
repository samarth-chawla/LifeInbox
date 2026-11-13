import "server-only";
import { notesPageSize, type NoteDraft, type NotePatch } from "../../lib/notes";
import { createItem } from "../db/items";
import { deleteNote, listNoteSummaries, readNote, updateNote } from "../db/notes";
import { getPool } from "../db/pool";
import { replaceItemTags } from "../db/tags";
import { withTransaction } from "../db/transaction";
import { withTrialCreation } from "./trials";

export async function getNotes(ownerId: string, page: number) {
  const rows = await listNoteSummaries(getPool(), ownerId, notesPageSize + 1, (page - 1) * notesPageSize);
  return { items: rows.slice(0, notesPageSize), page, hasMore: rows.length > notesPageSize };
}

export function getNote(ownerId: string, noteId: string) {
  return readNote(getPool(), ownerId, noteId);
}

export function saveNewNote(ownerId: string, draft: NoteDraft) {
  return withTrialCreation(getPool(), ownerId, async (db) => {
    const note = await createItem(db, ownerId, { kind: "note", title: draft.title, noteText: draft.noteText });
    if (draft.tags?.length) await replaceItemTags(db, ownerId, note.id, draft.tags);
    const saved = await readNote(db, ownerId, note.id);
    if (!saved) throw new Error("Created note was not found");
    return saved;
  });
}

export function editNote(ownerId: string, noteId: string, patch: NotePatch) {
  return withTrialCreation(getPool(), ownerId, async (db) => {
    if (!(await updateNote(db, ownerId, noteId, patch))) return null;
    if (patch.tags) await replaceItemTags(db, ownerId, noteId, patch.tags);
    return readNote(db, ownerId, noteId);
  });
}

export function removeNote(ownerId: string, noteId: string) {
  return withTransaction(getPool(), async (db) => {
    const owner = await db.query("SELECT 1 FROM lifeinbox.owners WHERE id = $1 AND active FOR UPDATE", [ownerId]);
    if (owner.rowCount === 0) return "ACCOUNT_UNAVAILABLE" as const;
    return await deleteNote(db, ownerId, noteId) ? "DELETED" as const : "ITEM_NOT_FOUND" as const;
  });
}
