"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { notesHref, notesPageSize, type NotesList, type SavedNote } from "../../lib/notes";
import { NoteEditor } from "./note-editor";

const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function OpeningNote() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="ml-2 text-xs text-muted">Opening…</span> : null;
}

export function NotesWorkspace({
  initialList, initialNote, unavailable, canWrite,
}: {
  initialList: NotesList; initialNote: SavedNote | null; unavailable: boolean; canWrite: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [note, setNote] = useState(initialNote);
  const [missing, setMissing] = useState(unavailable);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [trialEnded, setTrialEnded] = useState(false);
  const editor = useRef<HTMLElement>(null);
  const allowWrite = canWrite && !trialEnded;

  function focusEditor() {
    editor.current?.focus();
  }

  function startNote() {
    setNote(null);
    setMissing(false);
    setNotice("");
    window.history.replaceState(null, "", notesHref(list.page));
    focusEditor();
  }

  function saved(item: SavedNote) {
    const { id, kind, title, updatedAt } = item;
    const summary = { id, kind, title, updatedAt };
    if (!note && list.page !== 1) {
      setNote(item);
      setNotice("Note saved");
      router.replace(notesHref(1, item.id));
      return;
    }
    setList((current) => note
      ? { ...current, items: current.items.map((row) => row.id === item.id ? summary : row) }
      : { ...current, items: [summary, ...current.items].slice(0, notesPageSize), hasMore: current.hasMore || current.items.length === notesPageSize });
    setNote(item);
    setNotice("Note saved");
    window.history.replaceState(null, "", notesHref(list.page, item.id));
  }

  function removed() {
    const remaining = list.items.filter((item) => item.id !== note?.id);
    setList({ ...list, items: remaining });
    startNote();
    setNotice("Note deleted");
    if (!remaining.length && list.page > 1) {
      router.replace(notesHref(list.page - 1));
    } else if (list.hasMore) {
      void fetch(`/api/v1/items?page=${list.page}`)
        .then((response) => response.ok ? response.json() as Promise<NotesList> : null)
        .then((fresh) => {
          if (fresh) setList((current) => current.items === remaining ? fresh : current);
        })
        .catch(() => {});
    }
  }

  return (
    <div className="grid items-start overflow-hidden rounded-2xl border border-line bg-paper shadow-sm md:min-h-[34rem] md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-panel/45 md:min-h-full md:border-r md:border-b-0" aria-labelledby="saved-notes">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <h2 id="saved-notes" className="text-sm font-semibold">Saved notes</h2>
          {allowWrite && (
            <button type="button" onClick={startNote} disabled={pending}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-ink disabled:opacity-60">
              <span aria-hidden="true" className="mr-1">+</span> New note
            </button>
          )}
        </div>
        {list.items.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto p-2 md:max-h-[34rem] md:p-3">
            {list.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={notesHref(list.page, item.id)}
                  prefetch={false}
                  onClick={(event) => {
                    if (pending || note?.id === item.id) event.preventDefault();
                  }}
                  aria-current={note?.id === item.id ? "page" : undefined}
                  className="block rounded-lg border border-transparent px-3 py-2.5 hover:bg-paper aria-[current=page]:border-line aria-[current=page]:bg-paper"
                >
                  <span className="block wrap-break-word text-sm font-medium">{item.title}</span>
                  <time className="text-xs text-muted" dateTime={item.updatedAt}>{formatDate.format(new Date(item.updatedAt))}</time>
                  <OpeningNote />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-6 text-sm text-muted">{list.page > 1 ? "No notes on this page." : "No saved notes yet."}</p>}
        {(list.page > 1 || list.hasMore) && (
          <nav aria-label="Notes pages" className="flex gap-4 border-t border-line px-5 py-4 text-sm font-medium text-accent">
            {list.page > 1 && <Link href={notesHref(list.page - 1)} prefetch={false} onClick={(event) => { if (pending) event.preventDefault(); }} className="hover:underline">Previous</Link>}
            {list.hasMore && <Link href={notesHref(list.page + 1)} prefetch={false} onClick={(event) => { if (pending) event.preventDefault(); }} className="hover:underline">Next</Link>}
          </nav>
        )}
      </aside>
      <section ref={editor} tabIndex={-1} aria-labelledby="note-heading" className="min-w-0 outline-none">
        {missing ? (
          <div className="p-6 sm:p-9">
            <h2 id="note-heading" className="font-serif text-3xl">Note unavailable</h2>
            <button type="button" onClick={startNote} className="mt-4 text-sm text-accent underline">Back to notes</button>
          </div>
        ) : (
          <NoteEditor
            key={note?.id ?? "new"}
            note={note ?? undefined}
            canWrite={allowWrite}
            onSaved={saved}
            onDeleted={removed}
            onPending={setPending}
            onTrialEnded={() => setTrialEnded(true)}
          />
        )}
        <p role="status" className="sr-only">{notice}</p>
        {notice && <div aria-hidden="true" className="px-5 pb-5 text-sm font-medium text-accent sm:px-8">{notice}</div>}
      </section>
    </div>
  );
}
