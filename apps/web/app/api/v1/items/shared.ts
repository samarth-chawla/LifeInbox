import "server-only";
import { noteLimits, type NotePatch } from "../../../../lib/notes";
import { getEnv } from "../../../../server/env";
import { requireOwner } from "../../../../server/require-owner";

export const itemHeaders = { "Cache-Control": "no-store" };

export function itemJson(data: object, status = 200) {
  return Response.json(data, { status, headers: itemHeaders });
}

export function itemError(code: string, status: number) {
  return itemJson({ code }, status);
}

export async function withItemOwner(request: Request, work: (ownerId: string) => Promise<Response>) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("origin") !== getEnv().authOrigin) {
      return itemError("ORIGIN_NOT_ALLOWED", 403);
    }
    const owner = await requireOwner(request.headers);
    if (owner.status !== 200) {
      return itemError(owner.status === 401 ? "UNAUTHENTICATED" : "ACCOUNT_UNAVAILABLE", owner.status);
    }
    return await work(owner.ownerId);
  } catch {
    console.error("LifeInbox item request failed");
    return itemError("ITEM_REQUEST_UNAVAILABLE", 503);
  }
}

const maxRequestBytes = 1024 * 1024;

export async function readItemPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { error: itemError("EXPECTED_JSON", 415) };
  if (!request.body) return { error: itemError("INVALID_ITEM", 400) };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxRequestBytes) {
        await reader.cancel().catch(() => {});
        return { error: itemError("ITEM_PAYLOAD_TOO_LARGE", 413) };
      }
      text += decoder.decode(value, { stream: true });
    }
    const data: unknown = JSON.parse(text + decoder.decode());
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: itemError("INVALID_ITEM", 400) };
    return { data: data as Record<string, unknown> };
  } catch {
    return { error: itemError("INVALID_ITEM", 400) };
  } finally {
    reader.releaseLock();
  }
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && Boolean(value.trim()) && !value.includes("\0");
}

export function validateNotePatch(data: Record<string, unknown>): NotePatch | null {
  const keys = Object.keys(data);
  if (!keys.length || keys.some((key) => key !== "title" && key !== "noteText" && key !== "tags")) return null;

  const patch: NotePatch = {};
  if ("title" in data) {
    if (!isText(data.title, noteLimits.title)) return null;
    patch.title = data.title.trim();
  }
  if ("noteText" in data) {
    if (!isText(data.noteText, noteLimits.text)) return null;
    patch.noteText = data.noteText;
  }
  if ("tags" in data) {
    if (!Array.isArray(data.tags) || data.tags.length > noteLimits.tags) return null;
    const names: string[] = [];
    for (const name of data.tags) {
      if (!isText(name, noteLimits.tag) || name.includes(",")) return null;
      names.push(name.trim());
    }
    patch.tags = [...new Set(names)];
  }
  return patch;
}
