import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNoteId, parseNotesPage } from "../../lib/notes";
import { requireOwner } from "../../server/require-owner";
import { getAccount } from "../../server/services/account";
import { getLink, getLinks } from "../../server/services/saved-links";
import { LinksWorkspace } from "./links-workspace";

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; link?: string }>;
}) {
  const owner = await requireOwner(await headers()).catch(() => null);
  if (owner?.status === 401) redirect("/sign-in");

  const query = await searchParams;
  const page = (typeof query.page === "string" && parseNotesPage(query.page)) || 1;
  const id = typeof query.link === "string" && isNoteId(query.link) ? query.link : null;
  const data = owner?.status === 200
    ? await Promise.all([
      getAccount(owner.ownerId),
      getLinks(owner.ownerId, page),
      id ? getLink(owner.ownerId, id) : null,
    ]).catch(() => null)
    : null;
  const [account, list, selected] = data ?? [];

  return (
    <main className="min-h-dvh bg-panel/70">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="font-semibold">LifeInbox</Link>
          <nav aria-label="Workspace" className="flex gap-5 text-sm font-medium text-accent">
            <Link href="/notes" className="hover:underline">Notes</Link>
            <Link href="/account" className="hover:underline">Account</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-11">
        <h1 className="mb-6 font-serif text-5xl tracking-tight sm:text-6xl">Saved links</h1>
        {account && list ? (
          <LinksWorkspace key={`${page}:${id ?? "list"}`} initialList={list} initialSelected={selected ?? null}
            unavailable={query.link !== undefined && !selected} canSave={account.trial.status === "active"} />
        ) : <p role="alert" className="rounded-xl border border-line bg-paper p-5">Your saved links are currently unavailable.</p>}
      </div>
    </main>
  );
}
