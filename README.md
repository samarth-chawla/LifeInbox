# LifeInbox

LifeInbox is a personal information storage and retrieval platform. The web app currently serves the local Phase 0 shell and introduces the kinds of information the MVP will let users save.

## Local setup

Use Node.js 24 and npm 11 or newer. Run these commands from the repository root.

```sh
npm ci
npm run dev
```

Open [LifeInbox locally](http://127.0.0.1:3000). The shell runs without service credentials or an environment file.

## Scripts

| Root command | What it does |
|---|---|
| `npm run dev` | Start the web development server on loopback with hot reload. |
| `npm run lint` | Run the Next.js ESLint rules for the web workspace. |
| `npm run typecheck` | Generate App Router types and run strict TypeScript checks. |
| `npm run build` | Build the web app for production. |
| `npm start` | Serve the production build on loopback. Run the build first. |
| `npm test` | Run the Node.js HTTP smoke test against the app on `127.0.0.1:3000`. Keep either server running in another terminal. |
| `npm ls --workspaces --depth=0` | Inspect the workspace packages and their direct dependencies. |

Each root application script delegates to `@lifeinbox/web`. To run a command directly, use `npm run <script> --workspace=@lifeinbox/web`.

The root npm override selects a patched `minimatch` range for the lint toolchain. Remove it once the lint dependencies resolve patched versions themselves. [npm advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Workspaces

| Path | Responsibility |
|---|---|
| `apps/web/` | Next.js App Router, React, strict TypeScript, Tailwind CSS, ESLint and the local HTTP smoke test. This is the only app workspace. |
| `packages/types/` | Private, types-only `@lifeinbox/types` workspace. The shell imports `CaptureKind` to type its capture labels. Future clients can share the same compile-time contract. |
| `docs/` | Product, architecture, security and implementation decisions. |

npm links the workspaces from one root `package-lock.json`. Keeping the web app under `apps/web` allows a native app to be added later without moving the web project. Add shared runtime validation when multiple callers actually need the same client-safe validation rules. TypeScript types alone do not validate runtime input.

## Server and client boundaries

App Router components are server components by default. Add a client component only for browser behavior. Keep database access, Better Auth configuration, storage and AI credentials, and privileged operations inside the web app's server modules as those features land. Mark modules that must never enter the browser bundle with Next.js's `server-only` convention. Shared packages contain client-safe code and types.

`.env.example` lists blank variable names for later phases. Next.js loads environment files from `apps/web/`. Put local values in the ignored `apps/web/.env.local` when a phase requires them. Keep secrets out of Git, client components, public assets and `NEXT_PUBLIC_*` variables.

The shell sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a strict cross-origin referrer policy. Future protected handlers will validate sessions, resolve the LifeInbox owner, and pass that owner to services and owner-scoped data access.

See [AGENTS.md](AGENTS.md), the [architecture](docs/03_Architecture_Data_Flow.md), and the [implementation plan](docs/Implementation_Plan.md).
