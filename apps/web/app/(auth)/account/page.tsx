import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwner } from "../../../server/require-owner";
import { getAccount } from "../../../server/services/account";
import { SignOutButton } from "./sign-out-button";

const formatNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function formatBytes(bytes: number) {
  const mib = 1024 * 1024;
  return bytes < mib ? `${formatNumber.format(bytes)} B` : `${formatNumber.format(bytes / mib)} MiB`;
}

export default async function AccountPage() {
  const owner = await requireOwner(await headers()).catch(() => null);
  if (owner?.status === 401) redirect("/sign-in");
  const account = owner?.status === 200 ? await getAccount(owner.ownerId).catch(() => null) : null;
  const trial = account?.trial;

  return (
    <>
      <h1 className="font-serif text-4xl tracking-tight">Your account</h1>
      <p className="mt-4">
        {trial ? "You’re signed in to LifeInbox." : "Your LifeInbox account is currently unavailable."}
      </p>
      {trial && (
        <section aria-labelledby="trial-heading" className="mt-6 border-t border-line pt-5">
          <h2 id="trial-heading" className="text-xl font-semibold">
            {trial.status === "active" ? "Free trial active" : "Free trial ended"}
          </h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="font-medium">Original upload storage</dt>
              <dd>{formatBytes(trial.confirmedBytes)} used of {formatBytes(trial.allowanceBytes)}</dd>
              {trial.reservedBytes > 0 && <dd>{formatBytes(trial.reservedBytes)} reserved for uploads</dd>}
            </div>
            <div>
              <dt className="font-medium">Trial deadline</dt>
              <dd>
                <time dateTime={trial.deadline}>
                  {formatDate.format(new Date(trial.deadline))} UTC
                </time>
              </dd>
            </div>
            {trial.endedAt && (
              <div>
                <dt className="font-medium">Ended</dt>
                <dd><time dateTime={trial.endedAt}>{formatDate.format(new Date(trial.endedAt))} UTC</time></dd>
              </div>
            )}
          </dl>
          {trial.status === "ended" && (
            <p className="mt-4 text-sm">
              {trial.endReason === "storage" ? "You reached your storage allowance." : "Your seven-day trial has ended."}{" "}
              Your saved items stay available. New saves and uploads are paused. Paid storage is planned.
            </p>
          )}
        </section>
      )}
      {account && <Link href="/notes" className="mt-6 inline-block font-medium text-accent underline underline-offset-4">Open notes</Link>}
      {owner && <SignOutButton />}
    </>
  );
}
