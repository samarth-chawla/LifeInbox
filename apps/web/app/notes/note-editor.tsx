"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { noteLimits, type SavedNote } from "../../lib/notes";

const inputClass = "block w-full rounded-lg border border-line bg-white/65 px-3 py-2.5 text-ink outline-none placeholder:text-muted/75 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25";
const primary = "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink disabled:opacity-60";

export function NoteEditor({
  note, canWrite, onSaved, onDeleted, onPending, onTrialEnded,
}: {
  note?: SavedNote;
  canWrite: boolean;
  onSaved: (note: SavedNote) => void;
  onDeleted: () => void;
  onPending: (pending: boolean) => void;
  onTrialEnded: () => void;
}) {
  const [action, setAction] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const path = note ? `/api/v1/items/${note.id}` : "/api/v1/items";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title")).trim();
    const noteText = String(fields.get("noteText"));
    const tags = String(fields.get("tags")).split(",").map((name) => name.trim()).filter(Boolean);
    if (!title || !noteText.trim() || tags.length > noteLimits.tags || tags.some((name) => name.length > noteLimits.tag)) {
      setError("Enter a title and note. Use up to 20 tags, each at most 50 characters.");
      return;
    }

    setError("");
    setAction("save");
    onPending(true);
    try {
      const response = await fetch(path, {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { title, noteText, tags } : { kind: "note", title, noteText, tags }),
      });
      if (response.status === 401) {
        setError("Your session expired. Copy your draft before signing in again.");
        return;
      }
      const data: { code?: string; item?: SavedNote } = await response.json();
      if (data.code === "TRIAL_ENDED") {
        setError("Your trial ended before this change could be saved.");
        return;
      }
      if (!response.ok || !data.item) {
        setError("Could not save your note. Check your entries and try again.");
        return;
      }
      onSaved(data.item);
    } catch {
      setError("Could not save your note. Try again.");
    } finally {
      setAction(null);
      onPending(false);
    }
  }

  async function remove() {
    setError("");
    setAction("delete");
    onPending(true);
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      onDeleted();
    } catch {
      setError("Could not delete your note. Try again.");
    } finally {
      setAction(null);
      onPending(false);
    }
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <h2 id="note-heading" className="wrap-break-word font-serif text-3xl tracking-tight">
        {note?.title ?? (canWrite ? "New note" : "Free trial ended")}
      </h2>
      {canWrite ? (
        <form method="post" onSubmit={save} className="mt-5" aria-busy={action === "save"}>
          <fieldset disabled={action !== null || confirmDelete} className="space-y-5">
            <label className="block text-sm font-medium">
              Title
              <input name="title" defaultValue={note?.title} required maxLength={noteLimits.title}
                placeholder="Give your note a title" className={`mt-1.5 ${inputClass}`} />
            </label>
            <label className="block text-sm font-medium">
              Note
              <textarea name="noteText" defaultValue={note?.noteText} required rows={10} maxLength={noteLimits.text}
                placeholder="Write something you want to remember…" className={`mt-1.5 leading-relaxed ${inputClass}`} />
            </label>
            <label className="block text-sm font-medium">
              Tags <span className="font-normal text-muted">(optional)</span>
              <input name="tags" defaultValue={note?.tags.join(", ")} maxLength={noteLimits.tags * (noteLimits.tag + 2)}
                placeholder="Separate tags with commas" className={`mt-1.5 ${inputClass}`} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={primary}>{action === "save" ? "Saving…" : "Save note"}</button>
              {action === "save" && <span role="status" className="sr-only">Saving note</span>}
            </div>
          </fieldset>
        </form>
      ) : note ? (
        <>
          <p className="mt-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm">Your trial has ended. This note is read-only.</p>
          <p className="mt-5 whitespace-pre-wrap wrap-break-word leading-relaxed">{note.noteText}</p>
          {note.tags.length > 0 && (
            <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-2">
              {note.tags.map((tag) => <li key={tag} className="rounded-full bg-panel px-3 py-1 text-xs">{tag}</li>)}
            </ul>
          )}
        </>
      ) : <p className="mt-3 text-sm">You can still open and delete notes you already saved.</p>}
      {note && (
        <div className="mt-6 border-t border-line pt-4 text-sm">
          {confirmDelete ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4" aria-busy={action === "delete"}>
              <p className="font-medium text-red-950">Delete this note permanently?</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={action !== null} onClick={remove}
                  className="rounded-lg bg-red-800 px-3 py-2 font-semibold text-white hover:bg-red-950 disabled:opacity-60">
                  {action === "delete" ? "Deleting…" : "Delete permanently"}
                </button>
                <button type="button" disabled={action !== null} onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-line bg-paper px-3 py-2">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={action !== null} onClick={() => setConfirmDelete(true)}
              className="font-medium text-red-800 hover:underline disabled:opacity-60">Delete note</button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
          {error}
          {error.startsWith("Your session expired") && (
            <Link href="/sign-in" className="ml-2 font-semibold underline">Sign in</Link>
          )}
          {error.startsWith("Your trial ended") && (
            <button type="button" onClick={onTrialEnded} className="ml-2 font-semibold underline">Discard unsaved changes</button>
          )}
        </div>
      )}
    </div>
  );
}
