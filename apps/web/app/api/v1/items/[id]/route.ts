import { isNoteId } from "../../../../../lib/notes";
import { editNote, getNote, removeNote } from "../../../../../server/services/notes";
import { getLink, removeLink } from "../../../../../server/services/saved-links";
import { itemError, itemHeaders, itemJson, readItemPayload, validateNotePatch, withItemOwner } from "../shared";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return withItemOwner(request, async (ownerId) => {
    const { id } = await params;
    if (!isNoteId(id)) return itemError("INVALID_ITEM_ID", 400);
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== null && kind !== "note" && kind !== "url") return itemError("INVALID_ITEM_KIND", 400);
    const note = kind === "url" ? null : await getNote(ownerId, id);
    const item = note ?? (kind === "note" ? null : await getLink(ownerId, id));
    return item ? itemJson({ item }) : itemError("ITEM_NOT_FOUND", 404);
  });
}

export function PATCH(request: Request, { params }: Context) {
  return withItemOwner(request, async (ownerId) => {
    const { id } = await params;
    if (!isNoteId(id)) return itemError("INVALID_ITEM_ID", 400);
    const payload = await readItemPayload(request);
    if (payload.error) return payload.error;
    const patch = validateNotePatch(payload.data);
    if (!patch) return itemError("INVALID_ITEM", 400);
    const result = await editNote(ownerId, id, patch);
    if (!result.allowed) return itemError(result.reason, 403);
    return result.value ? itemJson({ item: result.value }) : itemError("ITEM_NOT_FOUND", 404);
  });
}

export function DELETE(request: Request, { params }: Context) {
  return withItemOwner(request, async (ownerId) => {
    const { id } = await params;
    if (!isNoteId(id)) return itemError("INVALID_ITEM_ID", 400);
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind !== null && kind !== "note" && kind !== "url") return itemError("INVALID_ITEM_KIND", 400);
    const note = kind === "url" ? "ITEM_NOT_FOUND" : await removeNote(ownerId, id);
    const result = note === "ITEM_NOT_FOUND" && kind !== "note" ? await removeLink(ownerId, id) : note;
    if (result === "DELETED") return new Response(null, { status: 204, headers: itemHeaders });
    return itemError(result, result === "ITEM_NOT_FOUND" ? 404 : 403);
  });
}
