# LifeInbox Repository Instructions

- Read the [PRD](docs/01_PRD_LifeInbox.md), [architecture](docs/03_Architecture_Data_Flow.md), [security requirements](docs/07_Security_Privacy.md), and [implementation plan](docs/Implementation_Plan.md) before changing the relevant area.
- Use npm workspaces and one root `package-lock.json`. Keep the Next.js App Router app in `apps/web`. Share only client-safe code or types with a concrete use.
- For framework behavior, consult the docs bundled with the installed Next.js version in `node_modules/next/dist/docs/`.
- Use one Next.js App Router application with TypeScript, Tailwind CSS and Route Handlers. Use Route Handlers → services → repositories where useful. Do not add Express or complex microservices.
- Use PostgreSQL with parameterized SQL through `pg`, Better Auth with PostgreSQL persistence, and pgvector for embeddings. Do not add Prisma or a separate vector database.
- Centralize Better Auth session validation and resolve a stable LifeInbox owner before calling services. Scope user-owned queries, search, jobs, files, exports and entitlements to that owner. Keep auth provider IDs at the identity boundary.
- Keep originals and exports in private S3-compatible storage. Cloudflare R2 is the preferred candidate. Store object keys in PostgreSQL and issue short-lived signed links only after authorization. Never expose a public bucket.
- Enforce the earlier of the seven-day trial deadline or the configurable per-user original-upload byte allowance. Use atomic reservations, finalization and cleanup. Preserve existing data, keep the paid upgrade prompt separate from payment processing, and follow the agreed post-trial access policy.
- Use PostgreSQL-backed jobs with owner checks, bounded retries, observable status and idempotent effects. Do not introduce Redis or BullMQ for MVP.
- Keep saving, URL/PDF extraction, OCR and keyword/metadata search independent of external AI. Require user permission for external AI and keep provider credentials server-side. Keep embeddings modular. MVP includes semantic retrieval and excludes chat or RAG-generated answers.
- Validate inputs, file sizes, MIME types, signatures and filenames. Protect URL fetches and redirects against SSRF. Require secure sessions, rate limits, export authorization and retryable account deletion through Better Auth and LifeInbox cleanup.
- Deliver one reviewed phase at a time. Verify owner isolation and relevant failure/retry paths. Payment integration and production hosting selection require separate scope decisions.
