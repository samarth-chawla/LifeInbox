import { isNoteId } from "../../../../../../lib/notes";
import { retryLink } from "../../../../../../server/services/saved-links";
import { itemError, itemJson, withItemOwner } from "../../shared";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withItemOwner(request, async (ownerId) => {
    const { id } = await params;
    if (!isNoteId(id)) return itemError("INVALID_ITEM_ID", 400);
    const result = await retryLink(ownerId, id);
    return "item" in result ? itemJson({ item: result.item }, result.status) : itemError(result.code, result.status);
  });
}
