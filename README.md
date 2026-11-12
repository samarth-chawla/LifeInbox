# LifeInbox

LifeInbox is a personal information storage and retrieval platform. The web app includes the local shell and an email/password account flow with a stable LifeInbox owner identity.

## Local setup

Use Node.js 24 and npm 11 or newer. Run these commands from the repository root.

```sh
npm ci
npm run dev
```

Open [LifeInbox locally](http://localhost:3000). The shell runs without service credentials or an environment file. Follow the authentication setup below before using the account pages.

## Scripts

| Root command | What it does |
|---|---|
| `npm run dev` | Start the web development server on loopback with hot reload. |
| `npm run lint` | Run the Next.js ESLint rules for the web workspace. |
| `npm run typecheck` | Generate App Router types and run strict TypeScript checks. |
| `npm run build` | Build the web app for production. |
| `npm start` | Serve the production build on loopback. Run the build first. |
| `npm test` | Run the Node.js HTTP smoke test against the app on `127.0.0.1:3000`. Keep either server running in another terminal. |
| `npm run db:migrate` | Apply tracked SQL to the PostgreSQL database in `DATABASE_URL`. |
| `npm run db:auth-schema` | Print SQL from Better Auth's schema generator for the configured database. Review the output before using it as a migration. |
| `npm run test:auth` | Run the PostgreSQL and HTTP authentication integration tests with a local test inbox. |
| `npm run test:db` | Run the PostgreSQL repository, ownership, and transaction integration tests. |
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

App Router components are server components by default. The auth forms and sign-out button call same-origin HTTP routes. Better Auth configuration, SMTP credentials, PostgreSQL access and owner resolution live under `apps/web/server/` and use `server-only`. Shared packages contain client-safe code and types.

`.env.example` lists blank variable names. Next.js loads environment files from `apps/web/`. Put local values in the ignored `apps/web/.env.local`. Keep secrets out of Git, client components, public assets and `NEXT_PUBLIC_*` variables.

The shell sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a strict cross-origin referrer policy. Auth responses and the reset page use `no-store` and `no-referrer`. Keep verification and reset URLs out of proxy and request logs.

## Authentication setup

Create a dedicated local PostgreSQL database and set these values in `apps/web/.env.local` or the shell before running the app.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the LifeInbox database. |
| `BETTER_AUTH_URL` | The exact app origin, such as `http://localhost:3000` for local development. Use the same origin in your browser. Production requires HTTPS. |
| `BETTER_AUTH_SECRET` | A random server secret of at least 32 characters. Generate a fresh one for each environment. |
| `AUTH_SMTP_URL` | The configured `smtp:` or `smtps:` endpoint. Use a local inbox or a third-party SMTP relay. The app requires TLS for external SMTP servers. |
| `AUTH_EMAIL_FROM` | The sender address accepted by the configured mail service. |
| `AUTH_TRUSTED_CLIENT_IP_HEADER` | Optional. Set it only when a trusted ingress overwrites this header and clients cannot reach the app directly. Otherwise Better Auth uses a shared per-route rate-limit bucket. |
| `TRIAL_STORAGE_ALLOWANCE_BYTES` | Positive byte allowance for new trials. Local development defaults to 100 MiB for testing. Set an explicit value before starting new trials in production. |

Run `npm run db:migrate` before registration. The generated SQL creates Better Auth's `auth` schema, including its database rate-limit table. LifeInbox SQL adds the `lifeinbox` schema, stable owners, identity mappings and a trigger on `auth."user"`. The migration runner serializes runs and records checksums. Keep applied files immutable. For a Better Auth upgrade, generate and review a new migration against a disposable copy of the current schema. [Better Auth PostgreSQL](https://better-auth.com/docs/adapters/postgresql) · [Schema generation](https://better-auth.com/docs/concepts/database)

Better Auth handles password hashing, verification, recovery, and cookie sessions. Verification emails contain a link and a six-digit code. Enter the code at `/verify-email` within five minutes, or request a fresh email from that page. The owner trigger inserts the LifeInbox owner and identity mapping in the transaction that inserts the auth user. Sign-in requires verified email and an active owner. Protected requests revalidate the persisted session, resolve the owner, and call account logic with the LifeInbox owner ID. `GET /api/v1/me` returns `ownerId`, `createdAt`, and `trial`. Missing sessions receive 401, and missing or inactive owners receive 403.

Existing auth records without a valid owner mapping require operator repair. LifeInbox does not recreate an owner from an email address or a browser-provided ID. For production, use a migration role for DDL and grant the runtime role only the schema and table access needed for auth, owner lookup, and the provisioning trigger.

Registration and recovery require working SMTP delivery. Mailpit can capture messages locally, and a transactional SMTP provider can deliver them to a real inbox. For a provider, use its SMTP credentials in a URL such as `smtps://USERNAME:PASSWORD@smtp.example.com:465` and set `AUTH_EMAIL_FROM` to an address the provider authorizes. Percent-encode special characters in the username and password. Keep the credentials in the ignored environment file and restart the development server after changing them.

No production email provider is selected. The app logs delivery failures without email addresses, links or tokens. It never marks an address verified on delivery failure.

## Application SQL

The SQL migration runner applies `003_application_core.sql` after the auth and owner migrations. It creates `items`, `owner_settings`, `tags`, and `item_tags` in the `lifeinbox` schema. Items and tags use owner-qualified keys, and a tag assignment can only reference an item and tag under the same owner. Tag names are trimmed and compared case-sensitively within each owner. Owners without a settings row have external AI disabled.

Server repositories take the resolved LifeInbox owner ID and a PostgreSQL query client. Use the existing pool for individual operations and pass the transaction client to every repository call in a group of writes.

## Trial and storage usage

Apply migration `004_owner_trials.sql` with `npm run db:migrate`. A verified owner's first successful sign-in starts their seven-day trial. An owner already signed in during rollout starts on their first account request. The allowance is fixed for that trial when it starts. The account page and `GET /api/v1/me` report usage, the deadline and the end reason.

Use `withTrialCreation` for new saves and to recheck an upload before finalizing it. The callback runs in a transaction that locks the active owner. Storage usage changes check the deadline and allowance again in PostgreSQL. Phase 6 will add the reservation records, private storage and cleanup that feed those counters.

## PostgreSQL integration tests

Use a dedicated PostgreSQL database whose name ends in `_test`. In a separate terminal, set `LIFEINBOX_TEST_DATABASE_URL` to that database and set `DATABASE_URL` to the same URL for migration. Run `npm run db:migrate`, then `npm run test:db` for the SQL repository suite. The SQL tests connect directly to PostgreSQL.

For `npm run test:auth`, stop any web development server in this checkout first. The suite starts its own loopback Next.js server and SMTP inbox, creates disposable accounts, and deliberately invalidates sessions and mappings in the test database. Both suites require the dedicated test database. The separate `npm test` command remains the Phase 0 shell smoke test.

See [AGENTS.md](AGENTS.md), the [architecture](docs/03_Architecture_Data_Flow.md), and the [implementation plan](docs/Implementation_Plan.md).
