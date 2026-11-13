"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { noteLimits, notesHref } from "../../lib/notes";

type EditableNote = { id: string; title: string; noteText: string; tags: string[] };

const field = "mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-accent";
const primary = "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";

export function NoteEditor({ note, canWrite }: { note?: EditableNote; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const path = note ? `/api/v1/items/${note.id}` : "/api/v1/items";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailed(false);
    setMessage("");
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title")).trim();
    const noteText = String(fields.get("noteText"));
    const tags = String(fields.get("tags")).split(",").map((name) => name.trim()).filter(Boolean);
    if (!title || !noteText.trim() || tags.length > noteLimits.tags || tags.some((name) => name.length > noteLimits.tag)) {
      setFailed(true);
      setMessage("Enter a title and note. Use up to 20 tags, each at most 50 characters.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(path, {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { title, noteText, tags } : { kind: "note", title, noteText, tags }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFailed(true);
        setMessage(data.code === "TRIAL_ENDED"
          ? "Your trial has ended. You can still read or delete saved notes."
          : "Could not save your note. Check your entries and try again.");
        return;
      }
      if (!note) router.replace(notesHref(1, data.item.id));
      setMessage("Note saved.");
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Could not save your note. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      router.replace("/notes");
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Could not delete your note. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h2 id="note-heading" className="break-words font-serif text-3xl">
        {note?.title ?? (canWrite ? "New note" : "Free trial ended")}
      </h2>
      {canWrite ? (
        <form method="post" onSubmit={save} className="mt-5">
          <fieldset disabled={pending} className="space-y-4">
            <label className="block text-sm font-medium">
              Title
              <input name="title" defaultValue={note?.title} required maxLength={noteLimits.title} className={field} />
            </label>
            <label className="block text-sm font-medium">
              Note
              <textarea name="noteText" defaultValue={note?.noteText} required rows={9} maxLength={noteLimits.text} className={field} />
            </label>
            <label className="block text-sm font-medium">
              Tags <span className="font-normal text-muted">(separate with commas)</span>
              <input name="tags" defaultValue={note?.tags.join(", ")} maxLength={noteLimits.tags * (noteLimits.tag + 2)} className={field} />
            </label>
            <button className={primary}>{pending ? "Please wait…" : "Save note"}</button>
          </fieldset>
        </form>
      ) : note ? (
        <>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{note.noteText}</p>
          {note.tags.length > 0 && (
            <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-2">
              {note.tags.map((tag) => <li key={tag} className="rounded-full bg-panel px-3 py-1 text-xs">{tag}</li>)}
            </ul>
          )}
        </>
      ) : <p className="mt-3 text-sm">You can still open and delete notes you already saved.</p>}
      {note && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
          {confirmDelete ? (
            <>
              <p>Delete this note permanently?</p>
              <button type="button" disabled={pending} onClick={remove} className="font-semibold text-red-800 underline disabled:opacity-60">Delete permanently</button>
              <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="text-accent underline">Cancel</button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-red-800 underline underline-offset-4 disabled:opacity-60">
              Delete note
            </button>
          )}
        </div>
      )}
      {message && <p role={failed ? "alert" : "status"} className="mt-4 text-sm">{message}</p>}
    </>
  );
}
