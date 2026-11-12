import type { CaptureKind } from "@lifeinbox/types";
import Link from "next/link";

const captureLabels = {
  note: "Text notes",
  url: "Web links",
  image: "Images and screenshots",
  pdf: "PDFs",
  document: "Documents",
} satisfies Record<CaptureKind, string>;

export default function HomePage() {
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-6 sm:px-10">
      <header className="flex items-center gap-3 border-b border-line py-6">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-lg bg-accent"
        >
          <span className="h-4 w-3 rounded-xs border border-paper" />
        </span>
        <span className="text-lg font-semibold tracking-tight">LifeInbox</span>
        <Link href="/sign-in" className="ml-auto text-sm font-semibold text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </header>

      <main className="grid items-start gap-12 py-14 sm:py-20 md:grid-cols-[1.35fr_1fr] md:gap-12 lg:gap-20 lg:py-28">
        <div>
          <h1 className="font-serif text-[clamp(3rem,7vw,5.25rem)] leading-[0.98] tracking-tight">
            Save anything.
            <span className="block text-accent">Find it later.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            A personal archive for the information you want to find again,
            wherever you first saved it.
          </p>
        </div>

        <section
          aria-labelledby="capture-heading"
          className="rounded-2xl border border-line bg-panel p-6 sm:p-8"
        >
          <h2 id="capture-heading" className="text-sm font-semibold text-accent">
            Planned capture types
          </h2>
          <ul role="list" className="mt-3 divide-y divide-line">
            {Object.values(captureLabels).map((label) => (
              <li key={label} className="py-3 text-base">
                {label}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
