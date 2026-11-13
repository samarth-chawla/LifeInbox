import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNoteId, parseNotesPage } from "../../lib/notes";
import { requireOwner } from "../../server/require-owner";
import { getAccount } from "../../server/services/account";
import { getNote, getNotes } from "../../server/services/notes";
import { NotesWorkspace } from "./notes-workspace";

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

  return (
    <main className="min-h-dvh bg-panel/70">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold text-white">L</span>
            LifeInbox
          </Link>
          <nav aria-label="Workspace" className="flex items-center gap-4 text-sm font-medium">
            <Link href="/links" className="text-accent hover:underline">Saved links</Link>
            <Link href="/account" className="rounded-lg border border-line px-3.5 py-2 hover:bg-panel">Account</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-12 sm:px-8 sm:pt-11">
        <h1 className="mb-6 font-serif text-5xl tracking-tight sm:text-6xl">Notes</h1>
        {account && notes ? (
          <NotesWorkspace
            key={`${page}:${typeof query.note === "string" ? query.note : "new"}`}
            initialList={notes}
            initialNote={note ?? null}
            unavailable={query.note !== undefined && !note}
            canWrite={account.trial.status === "active"}
          />
        ) : <p role="alert" className="rounded-xl border border-line bg-paper p-5">Your notes are currently unavailable.</p>}
      </div>
    </main>
  );
}
