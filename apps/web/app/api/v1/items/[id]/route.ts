import { isNoteId } from "../../../../../lib/notes";
import { editNote, getNote, removeNote } from "../../../../../server/services/notes";
import { itemError, itemHeaders, itemJson, readItemPayload, validateNotePatch, withItemOwner } from "../shared";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return withItemOwner(request, async (ownerId) => {
    const { id } = await params;
    if (!isNoteId(id)) return itemError("INVALID_ITEM_ID", 400);
    const item = await getNote(ownerId, id);
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
    const result = await removeNote(ownerId, id);
    if (result === "DELETED") return new Response(null, { status: 204, headers: itemHeaders });
    return itemError(result, result === "ITEM_NOT_FOUND" ? 404 : 403);
  });
}
