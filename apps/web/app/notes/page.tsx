import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNoteId, notesHref, parseNotesPage } from "../../lib/notes";
import { requireOwner } from "../../server/require-owner";
import { getAccount } from "../../server/services/account";
import { getNote, getNotes } from "../../server/services/notes";
import { NoteEditor } from "./note-editor";

const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; note?: string | string[] }>;
}) {
  const owner = await requireOwner(await headers()).catch(() => null);
  if (owner?.status === 401) redirect("/sign-in");

  const query = await searchParams;
  const page = (typeof query.page === "string" && parseNotesPage(query.page)) || 1;
  const selectedId = typeof query.note === "string" && isNoteId(query.note) ? query.note : undefined;
  const data = owner?.status === 200
    ? await Promise.all([
      getAccount(owner.ownerId),
      getNotes(owner.ownerId, page),
      selectedId ? getNote(owner.ownerId, selectedId) : null,
    ]).catch(() => null)
    : null;
  const [account, notes, note] = data ?? [];
  const canWrite = account?.trial.status === "active";

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-6 pb-16 sm:px-10">
      <header className="flex items-center justify-between border-b border-line py-6">
        <Link href="/" className="text-lg font-semibold">LifeInbox</Link>
        <Link href="/account" className="text-sm font-medium text-accent underline underline-offset-4">Account</Link>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-4 py-8">
        <h1 className="font-serif text-5xl tracking-tight">Notes</h1>
        {canWrite && query.note !== undefined && (
          <Link href={notesHref(page)} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white">
            New note
          </Link>
        )}
      </div>
      {account && notes ? (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <aside className="rounded-xl border border-line bg-panel p-4 sm:p-5" aria-labelledby="saved-notes">
            <h2 id="saved-notes" className="font-semibold">Saved notes</h2>
            {notes.items.length ? (
              <ul className="mt-3 space-y-1">
                {notes.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={notesHref(page, item.id)}
                      aria-current={note?.id === item.id ? "page" : undefined}
                      className="block rounded-lg px-3 py-2.5 hover:bg-paper aria-[current=page]:bg-paper"
                    >
                      <span className="block break-words font-medium">{item.title}</span>
                      <time className="text-xs text-muted" dateTime={item.updatedAt.toISOString()}>
                        {formatDate.format(item.updatedAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">{page > 1 ? "No notes on this page." : "No notes yet."}</p>}
            {(page > 1 || notes.hasMore) && (
              <nav aria-label="Notes pages" className="mt-4 flex gap-4 text-sm text-accent underline underline-offset-4">
                {page > 1 && <Link href={notesHref(page - 1)}>Previous</Link>}
                {notes.hasMore && <Link href={notesHref(page + 1)}>Next</Link>}
              </nav>
            )}
          </aside>
          <section aria-labelledby="note-heading" className="min-w-0 rounded-xl border border-line p-5 sm:p-7">
            {query.note !== undefined && !note ? (
              <>
                <h2 id="note-heading" className="font-serif text-3xl">Note unavailable</h2>
                <Link href={notesHref(page)} className="mt-4 inline-block text-sm text-accent underline">Back to notes</Link>
              </>
            ) : (
              <NoteEditor key={note?.id ?? "new"} note={note ?? undefined} canWrite={canWrite} />
            )}
          </section>
        </div>
      ) : <p role="alert">Your notes are currently unavailable.</p>}
    </main>
  );
}
