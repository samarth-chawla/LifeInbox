"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { maxLinkTitleLength, maxUrlLength, type LinkStatus, type SavedLink, type SavedLinkSummary } from "../../lib/saved-links";

type LinkList = { items: SavedLinkSummary[]; page: number; hasMore: boolean };
const collection = "/api/v1/items";
const statusLabels: Record<LinkStatus, string> = {
  queued: "Queued", running: "Extracting", succeeded: "Extracted", failed: "Extraction failed",
};
const errors: Record<string, string> = {
  SOURCE_BLOCKED: "This address or one of its redirects is outside the allowed public web.",
  UNSUPPORTED_RESPONSE: "The source did not return supported HTML.",
  NO_TEXT: "The page did not contain readable text.",
  RESPONSE_TOO_LARGE: "The page exceeded the extraction size limit.",
  TIMEOUT: "The source took too long to respond.",
};

function linkHref(page: number, id?: string) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (id) query.set("link", id);
  return query.size ? `/links?${query}` : "/links";
}

const field = "w-full rounded-lg border border-line bg-white/70 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-accent";
const button = "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink disabled:opacity-60";

export function LinksWorkspace({ initialList, initialSelected, unavailable, canSave }: {
  initialList: LinkList; initialSelected: SavedLink | null; unavailable: boolean; canSave: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [selected, setSelected] = useState(initialSelected);
  const [missing, setMissing] = useState(unavailable);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const active = list.items.some((item) => item.status === "queued" || item.status === "running") ||
    selected?.status === "queued" || selected?.status === "running";
  const selectedId = selected?.id;
  const page = list.page;

  useEffect(() => {
    if (!active || pending || sessionEnded) return;
    const controller = new AbortController();
    let timer = setTimeout(poll, 3000);
    async function poll() {
      try {
        const [summary, detail] = await Promise.all([
          fetch(`${collection}?kind=url&page=${page}`, { signal: controller.signal }),
          selectedId ? fetch(`${collection}/${selectedId}?kind=url`, { signal: controller.signal }) : null,
        ]);
        if (summary.status === 401 || summary.status === 403) {
          if (!controller.signal.aborted) {
            setSessionEnded(true);
            setFailed(true);
            setMessage("This account is unavailable. Sign in again to refresh link status.");
          }
          return;
        }
        if (summary.ok) {
          const fresh = await summary.json() as LinkList;
          if (!controller.signal.aborted) setList(fresh);
        }
        if (detail?.ok) {
          const { item } = await detail.json() as { item: SavedLink };
          if (!controller.signal.aborted) setSelected(item);
        } else if (detail?.status === 404 && !controller.signal.aborted) {
          setSelected(null);
          setMissing(true);
        }
      } catch {
        // Keep the last rendered status during a temporary network error.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
      }
    }
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, page, pending, selectedId, sessionEnded]);

  async function change(path: string, options: RequestInit, success: string) {
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(path, options);
      if (!response.ok) {
        const { code } = await response.json();
        setFailed(true);
        setMessage(code === "TRIAL_ENDED" ? "Your trial has ended. Saved links remain available."
          : code === "INVALID_URL_ITEM" ? "Enter a public HTTP or HTTPS URL."
          : code === "RETRY_UNAVAILABLE" ? "This extraction is already queued or cannot be retried."
          : "Could not complete the request. Try again.");
        return null;
      }
      setMessage(success);
      return response;
    } catch {
      setFailed(true);
      setMessage("Could not reach LifeInbox. Try again.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const originalUrl = String(fields.get("url")).trim();
    const title = String(fields.get("title")).trim();
    const response = await change(collection, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "url", originalUrl, title: title || undefined }),
    }, "Link saved");
    if (response) {
      const { item } = await response.json() as { item: SavedLink };
      router.replace(linkHref(1, item.id));
    }
  }

  async function retry(id: string) {
    const response = await change(`${collection}/${id}/retry`, { method: "POST" }, "Extraction queued");
    if (response) {
      const { item } = await response.json() as { item: SavedLink };
      setSelected(item);
      setList((current) => ({ ...current, items: current.items.map((row) => row.id === id ? item : row) }));
    }
  }

  async function remove(id: string) {
    const response = await change(`${collection}/${id}?kind=url`, { method: "DELETE" }, "Link deleted");
    if (response) router.replace(linkHref(list.items.length === 1 ? Math.max(1, list.page - 1) : list.page));
  }

  return (
    <div className="grid gap-5 md:grid-cols-[19rem_minmax(0,1fr)]">
      <aside aria-label="Saved links" className="self-start rounded-2xl border border-line bg-paper p-3 shadow-sm">
        {canSave && <Link href={linkHref(list.page)} className={`mb-2 inline-block ${button}`}>+ Save a link</Link>}
        {list.items.length ? (
          <ul className="space-y-1">
            {list.items.map((item) => (
              <li key={item.id}>
                <Link prefetch={false} href={linkHref(list.page, item.id)} aria-current={selected?.id === item.id ? "page" : undefined}
                  className="block rounded-lg border border-transparent p-3 hover:bg-panel aria-[current=page]:border-line aria-[current=page]:bg-panel">
                  <span className="block wrap-break-word font-medium">{item.title}</span>
                  <span className="text-xs text-muted">{statusLabels[item.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="px-3 py-4 text-sm text-muted">{list.page > 1 ? "No links on this page." : "No saved links yet."}</p>}
        <nav aria-label="Link pages" className="flex gap-4 px-3 text-sm text-accent">
          {list.page > 1 && <Link href={linkHref(list.page - 1)}>Previous</Link>}
          {list.hasMore && <Link href={linkHref(list.page + 1)}>Next</Link>}
        </nav>
      </aside>
      <section className="min-w-0 rounded-2xl border border-line bg-paper p-5 shadow-sm sm:p-8" aria-label="Link details">
        {selected ? (
          <>
            <h2 className="wrap-break-word font-serif text-3xl">{selected.title}</h2>
            <a href={selected.originalUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 block wrap-break-word text-sm text-accent underline">{selected.originalUrl}</a>
            <p className="mt-5 text-sm font-semibold" role="status">{statusLabels[selected.status]}</p>
            {selected.status === "failed" && (
              <p className="mt-2 text-sm text-muted">{errors[selected.errorCode ?? ""] ?? "LifeInbox could not extract this page."}</p>
            )}
            {selected.extractedTitle && selected.extractedTitle !== selected.title && <h3 className="mt-5 text-lg font-semibold">{selected.extractedTitle}</h3>}
            {selected.description && <p className="mt-2 text-sm text-muted">{selected.description}</p>}
            {selected.extractedText && <p className="mt-4 whitespace-pre-wrap wrap-break-word leading-relaxed">{selected.extractedText}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-4">
              {selected.canRetry && <button type="button" disabled={pending} onClick={() => retry(selected.id)} className={button}>Retry extraction</button>}
              {confirmDelete ? (
                <>
                  <button type="button" disabled={pending} onClick={() => remove(selected.id)} className="text-sm font-semibold text-red-800 underline">Delete permanently</button>
                  <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="text-sm text-accent underline">Cancel</button>
                </>
              ) : <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-sm text-red-800 underline">Delete link</button>}
            </div>
          </>
        ) : missing ? (
          <h2 className="font-serif text-3xl">Link unavailable</h2>
        ) : canSave ? (
          <>
            <h2 className="font-serif text-3xl">Save a link</h2>
            <form method="post" onSubmit={save} className="mt-5">
              <fieldset disabled={pending} className="space-y-4">
                <label className="grid gap-1.5 text-sm font-medium">URL
                  <input name="url" type="url" required maxLength={maxUrlLength} placeholder="https://example.com/article" className={field} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">Title (optional)
                  <input name="title" maxLength={maxLinkTitleLength} className={field} />
                </label>
                <button className={button} type="submit">{pending ? "Saving…" : "Save link"}</button>
              </fieldset>
            </form>
          </>
        ) : <p>Your trial has ended. You can still open and delete saved links.</p>}
        {message && <p role={failed ? "alert" : "status"} className={`mt-4 text-sm ${failed ? "text-red-800" : "text-accent"}`}>{message}</p>}
      </section>
    </div>
  );
}
