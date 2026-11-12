"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign-out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-5">
      <button type="button" onClick={signOut} disabled={pending} className="rounded-lg bg-accent px-4 py-2.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className="mt-3 text-sm" role="alert">Could not sign out. Try again.</p>}
    </div>
  );
}
