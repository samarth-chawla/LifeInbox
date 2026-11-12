import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwner } from "../../../server/require-owner";
import { SignOutButton } from "./sign-out-button";

export default async function AccountPage() {
  const owner = await requireOwner(await headers()).catch(() => null);
  if (owner?.status === 401) redirect("/sign-in");

  return (
    <>
      <h1 className="font-serif text-4xl tracking-tight">Your account</h1>
      <p className="mt-4">
        {owner?.status === 200 ? "You’re signed in to LifeInbox." : "Your LifeInbox account is currently unavailable."}
      </p>
      {owner && <SignOutButton />}
    </>
  );
}
