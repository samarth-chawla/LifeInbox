import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12 sm:py-20">
      <Link href="/" className="font-semibold text-accent underline-offset-4 hover:underline">
        LifeInbox
      </Link>
      <div className="mt-6 rounded-2xl border border-line bg-panel p-6 sm:p-9">
        {children}
      </div>
    </main>
  );
}
