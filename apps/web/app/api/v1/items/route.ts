import { parseNotesPage } from "../../../../lib/notes";
import { getNotes, saveNewNote } from "../../../../server/services/notes";
import { itemError, itemJson, readItemPayload, validateNotePatch, withItemOwner } from "./shared";

export function GET(request: Request) {
  return withItemOwner(request, async (ownerId) => {
    const page = parseNotesPage(new URL(request.url).searchParams.get("page") ?? undefined);
    if (page === null) return itemError("INVALID_PAGE", 400);
    return itemJson(await getNotes(ownerId, page));
  });
}

export function POST(request: Request) {
  return withItemOwner(request, async (ownerId) => {
    const payload = await readItemPayload(request);
    if (payload.error) return payload.error;
    const { kind, ...fields } = payload.data;
    const note = validateNotePatch(fields);
    if (kind !== "note" || !note?.title || !note.noteText) return itemError("INVALID_ITEM", 400);
    const result = await saveNewNote(ownerId, { title: note.title, noteText: note.noteText, tags: note.tags });
    if (!result.allowed) return itemError(result.reason, 403);
    return itemJson({ item: result.value }, 201);
  });
}
