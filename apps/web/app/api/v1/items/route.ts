import { parseNotesPage } from "../../../../lib/notes";
import { getNotes, saveNewNote } from "../../../../server/services/notes";
import { getLinks, saveLink } from "../../../../server/services/saved-links";
import { parsePublicWebUrl } from "../../../../server/links/url";
import { maxLinkTitleLength } from "../../../../lib/saved-links";
import { itemError, itemJson, readItemPayload, validateNotePatch, withItemOwner } from "./shared";

export function GET(request: Request) {
  return withItemOwner(request, async (ownerId) => {
    const query = new URL(request.url).searchParams;
    const page = parseNotesPage(query.get("page") ?? undefined);
    if (page === null) return itemError("INVALID_PAGE", 400);
    const kind = query.get("kind");
    if (kind === "url") return itemJson(await getLinks(ownerId, page));
    if (kind !== null && kind !== "note") return itemError("INVALID_ITEM_KIND", 400);
    return itemJson(await getNotes(ownerId, page));
  });
}

export function POST(request: Request) {
  return withItemOwner(request, async (ownerId) => {
    const payload = await readItemPayload(request);
    if (payload.error) return payload.error;
    const { kind, ...fields } = payload.data;
    if (kind === "url") {
      const { originalUrl, title } = fields;
      const parsed = parsePublicWebUrl(originalUrl);
      if (typeof originalUrl !== "string" || !parsed ||
          Object.keys(fields).some((key) => key !== "originalUrl" && key !== "title") ||
          (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > maxLinkTitleLength ||
            title.includes("\0")))) return itemError("INVALID_URL_ITEM", 400);
      const result = await saveLink(ownerId, originalUrl, typeof title === "string" ? title.trim() : parsed.hostname.slice(0, maxLinkTitleLength));
      return result.allowed ? itemJson({ item: result.value }, 201) : itemError(result.reason, 403);
    }
    const note = validateNotePatch(fields);
    if (kind !== "note" || !note?.title || !note.noteText) return itemError("INVALID_ITEM", 400);
    const result = await saveNewNote(ownerId, { title: note.title, noteText: note.noteText, tags: note.tags });
    if (!result.allowed) return itemError(result.reason, 403);
    return itemJson({ item: result.value }, 201);
  });
}
