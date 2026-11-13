# LifeInbox Implementation Plan

## Baseline and scope

At planning time the repository contained project documentation only. Phase 0 establishes the local npm workspace and shell described in the [root README](../README.md). Later source paths are proposed.

The MVP covers manual capture of notes, URLs, images and screenshots, and PDFs and supported documents. It includes safe non-LLM extraction and OCR, optional AI metadata, job status and retry, owner-scoped lexical and semantic retrieval, the seven-day-or-storage trial, private downloads, complete export and secure account deletion. Start with keyword and metadata search, then ship semantic retrieval before MVP acceptance. Stage 3 hybrid ranking is planned as a follow-on because the approved MVP list calls for semantic search and omits hybrid search. Checkout and payment processing, Redis, BullMQ, separate vector databases, chat and RAG answers are outside MVP.

## Phase 0 — Local project foundation (COMPLETE)

- **Objective and prerequisites.** Establish a reproducible Next.js App Router foundation. Begin once implementation is authorized. Verify compatible Node.js, package manager and dependency versions against official docs and choose one lockfile. [Next.js setup](https://nextjs.org/docs/app/getting-started/installation)
- **Likely files and database.** Root npm workspace manifest, lockfile, ignore and environment templates, and setup README. Place the App Router shell, strict TypeScript, ESLint, Tailwind and smoke test in `apps/web`. Keep the shared capture type in `packages/types`. No schema or database connection required.
- **Dependencies and routes.** Next.js, React, TypeScript, Tailwind CSS, lint tooling and a minimal test runner. Only the shell route `/`; establish a convention for later `/api/v1` handlers.
- **Security and tests.** Ignore real environment files and build output, use placeholder values in examples, check client/server boundaries, and exercise a render smoke test. Run lint, type checking, tests and the production build locally.
- **Acceptance and deferrals.** A clean checkout can install from its lockfile, start locally, render the shell and pass all checks without cloud accounts or secrets. Defer Better Auth, PostgreSQL wiring, migrations, features and deployment.

## Phase 1 — Better Auth and stable LifeInbox owner (COMPLETE)

- **Objective and prerequisites.** Provide registration, sign-in, email verification, recovery, sign-out and revocation. Requires Phase 0, local PostgreSQL, a test mail transport, and review of the current Better Auth docs. [App Router](https://better-auth.com/docs/integrations/next) · [PostgreSQL](https://better-auth.com/docs/adapters/postgresql)
- **Likely files and database.** Auth pages, `apps/web/app/api/auth/[...all]/route.ts`, server auth/session and owner modules, and auth integration tests. Plan Better Auth's user/account/session/verification tables and minimal LifeInbox owner and unique identity mapping. Provision the owner idempotently and keep the auth subject at the boundary.
- **Dependencies and routes.** Better Auth, `pg`, and a mail transport. Better Auth endpoints and a minimal protected `GET /api/v1/me` use one centralized request-to-owner path. Entitlement fields are added in Phase 3.
- **Security and tests.** Validate sessions in protected handlers. Test cookie flags, trusted origins, supported password hashing, verification, reset, abuse rate limits, session revocation, concurrent provisioning and signed-out or blocked accounts. Use server-only secrets and keep reset tokens out of logs.
- **Acceptance and deferrals.** A verified user can sign in, recover access and consistently resolve the same LifeInbox owner. Invalid or revoked sessions cannot access the protected handler. Defer item management, optional auth plugins, subscriptions and full account cleanup.

The implementation uses Better Auth's PostgreSQL dialect and generated `auth` schema. A trigger on `auth."user"` provisions the LifeInbox UUID and unique provider/subject mapping in the user-insert transaction. An active owner is required when a session is created and resolved again on protected requests. `GET /api/v1/me` reads only the resolved owner's account data. Migrations, the PostgreSQL 17 integration suite with a loopback SMTP inbox, lint, strict TypeScript, the production build and the shell smoke test passed. See the [root README](../README.md#authentication-setup) for environment, migrations and tests. Production SMTP and ingress configuration remain open.

## Phase 2 — Application SQL and ownership constraints (IMPLEMENTED)

- **Objective and prerequisites.** Establish the application persistence and transaction patterns after Phase 1. Decide the reviewed direct-SQL migration workflow and test database isolation.
- **Likely files and database.** Server DB pool/transaction modules, owner-scoped repositories, SQL migration directory, DB fixtures and integration tests. Add core items, owner settings, tags and item-tag relationships. Add module-specific tables in the phases that need them.
- **Dependencies and routes.** Reuse `pg`, PostgreSQL and the test runner. Add a reviewed SQL migration runner or script as needed. This phase adds no public API routes.
- **Security and tests.** Parameterize SQL values and allow-list dynamic sort fields. Use owner-qualified constraints and repository tests that reject wrong-owner reads and relationships. Exercise rollback and concurrent duplicate writes against PostgreSQL.
- **Acceptance and deferrals.** A clean test database can apply the reviewed baseline and repository tests prove isolation. Defer Prisma, jobs, object storage, vector indexes and UI.

Migration `003_application_core.sql` adds the four core tables using the existing LifeInbox owner IDs and migration runner. Composite foreign keys enforce ownership on item-tag relationships. The server-only repositories use parameterized SQL and accept a shared transaction client for grouped writes. The PostgreSQL integration suite covers owner isolation, rollback and concurrent duplicate writes. See [test setup](../README.md#postgresql-integration-tests).

## Phase 3 — Trial and storage entitlement policy (IMPLEMENTED)

- **Objective and prerequisites.** Establish eligibility before exposing capture writes. Requires Phase 2 and agreement on trial start, post-trial permissions and the in-flight upload policy. Use an explicit test allowance until the product limit is approved.
- **Likely files and database.** Entitlement service/repository, clock and policy tests, account status UI, `/me` response. Add trial/entitlement state and the owner usage row. Record start, configured duration, deadline, applicable allowance, status, end time and reason. Keep the eventual paid plan reference provider-neutral.
- **Dependencies and routes.** Reuse PostgreSQL and `pg`. Extend `GET /api/v1/me` and use a shared service check for future capture routes. No checkout or subscription-management endpoint.
- **Security and tests.** Use server time. End the trial at the earlier of the seven-day deadline or confirmed original bytes reaching the configurable allowance. Keep the end reason durable and prevent resets after space is freed. Test exact time and byte boundaries, concurrent checks, idempotent initialization and restriction decisions. Phase 6 connects real uploads to the same transaction.
- **Acceptance and deferrals.** Account status reports the applicable allowance, deadline and end reason. The policy gates new creation without waiting for a scheduler and preserves existing data under the agreed policy. Defer payment, provider events, production quota/pricing defaults and upload transport.

The trial starts once at the first successful verified sign-in. An existing signed-in owner starts on their first account request after rollout. Expiry blocks new saves and uploads while allowing read, search, export and deletion of existing data as those features ship. Recheck eligibility when an upload is finalized. If the trial has ended, discard the staged upload and release its reservation after cleanup. A valid upload that reaches the cap can finalize and end the trial in the same transaction.

Migration `004_owner_trials.sql` records each owner's allowance, deadline, usage and end reason. The account page and `GET /api/v1/me` report the trial state, and the shared transaction guard supports future capture writes. Use `TRIAL_STORAGE_ALLOWANCE_BYTES` to test different allowances. The production allowance remains open.

## Phase 4 — Owner-scoped items and notes (IMPLEMENTED)

- **Objective and prerequisites.** Deliver manual text capture and editable titles and tags on top of Phases 1–3.
- **Likely files and database.** Item and tag UI, Route Handlers, services and repositories. Reuse core tables for note content, title, tags and source revision. Add columns only where a reviewed contract needs them.
- **Dependencies and routes.** Reuse Next.js and `pg`. Implement `POST/GET /api/v1/items` and `GET/PATCH/DELETE /api/v1/items/:id` for supported operations.
- **Security and tests.** Validate request payloads, scope IDs and associations to the owner, apply entitlement checks to creation and render text safely. Test CRUD, cross-owner ID guessing, forbidden writes after trial expiry and edit/delete behavior.
- **Acceptance and deferrals.** A signed-in owner can create, edit, tag and view their own notes. Another account cannot read or alter them. Defer URL fetches, uploads, search ranking and AI.

The notes page and item API use the existing items and tags tables. Note content and tag assignments save in a single transaction. The trial guard protects creation and edits, while reads and deletion remain available after expiry. Deleting a text note removes its tag assignments. See the [implemented API contract](05_API_Specification.md#3-items).

## Phase 5 — PostgreSQL jobs and safe URL capture

- **Objective and prerequisites.** Persist URL sources immediately and extract useful content through observable, retryable background processing. Requires Phase 4 and a repeatable local runner.
- **Likely files and database.** URL capture UI, job state and retry UI, fetch/extractor and worker modules. Add `processing_jobs` with owner, target revision, lease/attempt, timestamps and safe error codes. Persist original URL, extraction status and normalized text/metadata.
- **Dependencies and routes.** Reuse `pg`. Evaluate a maintained HTML extraction library and a fetch transport that can bind connections to vetted DNS results. Extend item creation and reads. Add proposed `POST /api/v1/items/:id/retry`. Keep queue claiming internal.
- **Security and tests.** Restrict fetches to HTTP(S) and validated public destinations on each redirect. Deny internal and metadata networks, prevent DNS rebinding, enforce time and decompressed size limits, validate MIME and handle malformed responses. Claim jobs atomically, enforce lease ownership at commit, and use bounded retries and revision-checked idempotent writes. Test controlled DNS/redirect fixtures, duplicate claims, lease recovery, retry authorization and stale results.
- **Acceptance and deferrals.** The original URL survives any failed fetch. A supported page is extracted without AI and errors are visible and safely retryable. Defer browser automation, authenticated scraping, Redis/BullMQ and document/OCR handlers.

## Phase 6 — Private uploads and atomic quota accounting

- **Objective and prerequisites.** Add private image, PDF and supported document upload. Requires entitlement and job foundations, file limits/allow-list, and validation of the selected S3-compatible upload path. R2 is the preferred candidate. [R2 presigned URL constraints](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- **Likely files and database.** File capture components, storage adapter, upload and reconciliation services. Add `files` and upload reservations. Finalize the immutable object reference, confirmed bytes, trial end when applicable and processing enqueue in a retry-safe sequence.
- **Dependencies and routes.** S3-compatible SDK and signing support, file signature detection, and an isolated test bucket or compatible local test service. Implement proposed `POST /api/v1/uploads/presign`, `POST /api/v1/items/:id/files/complete` and owner-scoped file metadata reads.
- **Security and tests.** Bind staging permissions to owner, object key, size and expiry. Verify actual size, MIME and signature before acceptance. Use bounded server-mediated upload if direct signing cannot enforce the required limit. Account for active reservations, keep finalized originals safe from replay and reconcile abandoned objects after upload permissions and writes have settled. Test concurrent reservations and finalizations, last-byte trial end, time expiry during upload, duplicate completion, cross-owner requests, file spoofing and cleanup retries.
- **Acceptance and deferrals.** Parallel requests cannot exceed the allowance. Valid files remain private, invalid objects never become readable items, and failed uploads leave no permanent quota charge or orphan. Defer public links, export packaging and payment integration.

## Phase 7 — PDF text extraction and OCR

- **Objective and prerequisites.** Make supported PDF, document and image text available for indexing independently of external AI. Requires private uploads, jobs and format decisions.
- **Likely files and database.** Document extraction/OCR worker handlers, processing status UI and parser fixtures. Use existing file/item extraction state and source revisions. Store normalized text and safe extraction metadata.
- **Dependencies and routes.** Evaluate a maintained PDF parser, approved format parsers and an OCR engine with required language packs. Reuse item status and retry routes.
- **Security and tests.** Isolate untrusted parsing with resource limits and no script execution. Test text PDFs, scans, corrupted and oversized inputs, timeouts, repeated execution, job cancellation and access to the preserved original.
- **Acceptance and deferrals.** Supported text PDFs and OCR fixtures produce searchable text or a visible recoverable failure. Saving works with AI disabled. Defer unsupported formats, hosted OCR until privacy is evaluated, and vector ranking.

## Phase 8 — Keyword and metadata search

- **Objective and prerequisites.** Deliver Stage 1 search over notes, metadata and available extracted text. Requires Phases 4–7 for end-to-end coverage. Retrieval work can start against notes earlier.
- **Likely files and database.** Search UI and filters, search service, repository and relevance fixtures. Add PostgreSQL text search and measured indexes, including GIN where suitable.
- **Dependencies and routes.** PostgreSQL full-text search and `pg`. Implement `GET /api/v1/search` with validated query, bounded pagination, type/tag/date filters, snippets and source links.
- **Security and tests.** Apply owner and account state before ranking or rendering. Escape snippets and constrain query size and cost. Test expected matches, owner isolation, pending/failed extraction, deleted items and AI-disabled use.
- **Acceptance and deferrals.** Users can find known items across supported capture types, open their saved item and follow its original URL where applicable. External AI is unnecessary. Private file downloads are accepted in Phase 11. Defer semantic or hybrid scores in this phase.

## Phase 9 — Embeddings and pgvector semantic search

- **Objective and prerequisites.** Deliver Stage 2 semantic retrieval for eligible users before MVP acceptance. Requires indexed text, consent controls and a selected reversible embedding configuration.
- **Likely files and database.** Provider interface, chunker, embedding job, vector repository and semantic search UI. Enable pgvector and add owner-scoped chunks and embeddings with source revisions, model/provider/version and dimensions. Plan an isolated reindex path when changing model or dimensions.
- **Dependencies and routes.** PostgreSQL pgvector, an embedding provider adapter or local runtime, and an optional `pg` vector binding helper. Add proposed `POST /api/v1/search/semantic` with filters and the same result/source contract as lexical retrieval.
- **Security and tests.** Recheck consent for external item or query embedding at dispatch. Ensure valid dimensions, bounded input and owner-scoped similarity queries. Start with exact search. Benchmark HNSW with the selected distance metric and realistic owner filters before adoption. Test consent withdrawal, outages, stale embeddings, model incompatibility, filtered recall and cross-owner isolation. [pgvector indexing and filtering](https://github.com/pgvector/pgvector#indexing)
- **Acceptance and deferrals.** An enabled user can find and open the saved item from a meaning-based query. Lexical retrieval works through disablement or provider failure. Defer hybrid ranking, generated answers and separate vector storage.

## Phase 10 — Optional AI metadata

- **Objective and prerequisites.** Add editable suggestions for titles, summaries, tags or categories. Requires the jobs framework, owner AI settings, provider disclosure and a reviewed provider configuration. This phase can run independently of vector indexing once those prerequisites are available.
- **Likely files and database.** Account controls, disclosure UI, enrichment service, provider adapter, jobs and tests. Persist suggestion provenance and settings separately from user-entered metadata using the item/settings records or a reviewed equivalent.
- **Dependencies and routes.** An optional provider SDK or server-side HTTP client. Use `PATCH /api/v1/me/settings` for permission and existing item endpoints for suggestions and user edits. Keep keys server-side.
- **Security and tests.** Send only disclosed, necessary content after checking current permission. Treat extracted text as untrusted and validate generated fields. Test queued work after revocation, retries, provider failure and preservation of manual edits.
- **Acceptance and deferrals.** An opted-in user can review and edit suggestions. AI-disabled saving, extraction and lexical search work with no external AI calls. Defer chat, answer generation, automated privileged actions and paid AI tiers.

## Phase 11 — Individual downloads and complete account export

- **Objective and prerequisites.** Return individual originals and export complete account data with preserved relationships. Requires private storage, jobs and agreed export consistency and retention rules.
- **Likely files and database.** Download and export services, archive/manifest builder, export status UI and tests. Add export records for owner, state, object key, expiry and safe failure state.
- **Dependencies and routes.** Reuse the S3 client and evaluate a streaming archive library. Implement `GET /api/v1/files/:id/download`, `POST /api/v1/exports`, `GET /api/v1/exports/:id` and its `/download` subroute.
- **Security and tests.** Authorize before collecting data and before signing each link. Queue large exports, use private temporary archives, sanitize archive paths and exclude passwords, tokens and secrets. Test relationship fidelity, concurrent edits under the chosen policy, other-owner requests, retries, expired links and cleanup.
- **Acceptance and deferrals.** Individual download returns the authorized original. A complete export includes saved items, original files, tags, metadata and settings with stable references and no credentials. Defer external transfer integrations and any public links.

## Phase 12 — Account deletion and cleanup

- **Objective and prerequisites.** Coordinate authorized account deletion through LifeInbox and Better Auth. Requires export/object cleanup paths, jobs, and the approved retention and backup policy.
- **Likely files and database.** Account settings confirmation UI, deletion service, Better Auth lifecycle integration, cleanup worker and audit tests. Persist an owner-scoped deletion operation and cleanup progress, preserving private object references until removal is verified.
- **Dependencies and routes.** Reuse Better Auth, PostgreSQL and S3-compatible storage. Implement the proposed `DELETE /api/v1/me` with recent authentication and durable acknowledgement. Use documented Better Auth deletion APIs and hooks. [Better Auth deletion](https://better-auth.com/docs/concepts/users-accounts#delete-user)
- **Security and tests.** Mark the owner as deleting and block access, invalidate normal jobs and revoke sessions. Permit only scoped cleanup for deleting accounts. Prevent in-flight uploads or jobs from recreating records. Retry cleanup of originals, staged objects, archives, embeddings, extracted data, jobs and metadata. Remove auth and application records in a sequence that preserves recovery references. Test duplicate deletion, failures between storage and DB operations, revoked access, old signed links and orphan reconciliation.
- **Acceptance and deferrals.** Access is blocked promptly, cleanup resumes after failure, and no private files or linked auth accounts are orphaned. Logs retain only approved audit state. Defer account recovery after deletion until policy calls for it.

## Phase 13 — Security, reliability and pilot readiness

- **Objective and prerequisites.** Verify MVP acceptance across Phases 0–12 and confirm pilot policies, operational owners and environment choices.
- **Likely files and database.** End-to-end fixtures, security/reliability tests, operational checklist, and deployment preparation documentation. Review indexes, connection budgets, backup/restore and cleanup queries. Schema changes only if a measured issue requires one and it is reviewed.
- **Dependencies and routes.** Add browser automation and observability tooling as justified. Exercise all user routes and restricted job operations. Add no new feature routes.
- **Security and tests.** Run two-owner isolation across search, jobs, downloads and exports. Exercise authentication/recovery, SSRF, malformed uploads, quota and trial races, AI opt-out, deletion retries, backup restoration and failure metrics. Validate least-privilege service credentials and logs without private content.
- **Acceptance and deferrals.** The roadmap acceptance criteria pass, worker throughput and alerting are sufficient for the pilot, and ownership and recovery procedures are documented. Deployment and pilot onboarding require the approved hosting decision. Defer billing, hybrid search and excluded integrations.

## Phase 14 — Hybrid search follow-on

- **Objective and prerequisites.** Evaluate Stage 3 ranking after lexical and semantic relevance baselines exist and MVP is accepted. Proceed if the measured benefit justifies the cost.
- **Likely files and database.** Ranking service and offline comparison fixtures. Reuse lexical and vector indexes. Consider query or index changes only where benchmarks justify them.
- **Dependencies and routes.** Reuse current search services. Evaluate reciprocal-rank fusion or weighted scores. Extend search with an explicitly documented mode if approved.
- **Security and tests.** Keep both candidate sets owner-scoped before fusion. Test recall, ranking, latency, duplicate results, consent and lexical fallback.
- **Acceptance and deferrals.** Enable hybrid search only after a measurable retrieval improvement with acceptable latency and isolation. Generated answers remain a separate scope decision.

## Eventual dependencies and data

| Area | Dependencies or services | Logical PostgreSQL records |
|---|---|---|
| Foundation | Node.js, a package manager, Next.js, React, TypeScript, Tailwind CSS, lint and test tooling | None in Phase 0 |
| Identity | Better Auth, `pg`, PostgreSQL, verification and recovery email transport | Better Auth users/accounts/sessions/verifications and enabled plugin tables, LifeInbox owners and auth identity mapping |
| Capture, trial and jobs | PostgreSQL-backed runner, HTML and document extractors, OCR, private S3 client and validation libraries | Owner settings, items and source URLs, extracted content/metadata, tags and item-tag relations, file metadata, jobs, storage usage, upload reservations, trials and entitlements |
| Retrieval | PostgreSQL full-text search, pgvector, selected embedding runtime or provider, optional AI metadata adapter | Text search fields/indexes, item chunks, embeddings and provider/model/revision metadata |
| Lifecycle | Streaming archive tooling, private object storage, job worker, operational logs and metrics | Export state, deletion state, authorized cleanup and minimal audit metadata |
| Future paid storage | Provider-neutral entitlement update path. A billing provider is chosen in future scope | Plan/price and owner subscription or equivalent entitlement records. MVP implements trial and allowance state. |

Production needs a Next.js runtime, managed PostgreSQL with the required pgvector version, private S3-compatible storage, a reliable auth email transport, and job execution capacity. A separately hosted job runner can share the app code and PostgreSQL queue. An external AI provider is needed only if the selected embedding or metadata implementation uses one. Core saving and lexical search must work without external AI credentials. Payment services are outside MVP.

## Hosting assessment

| Candidate | Fit and constraints to validate |
|---|---|
| Vercel Pro web tier with managed PostgreSQL and a PostgreSQL queue consumer | Evaluate for the Next.js UI and short API work. Vercel Functions have request payload and duration limits. Cron invocations can overlap and a failed invocation is not automatically retried. Use bounded queue batches or a separate worker for heavier OCR and exports, plus private direct uploads only where the transport enforces the required bounds. Vercel Hobby is restricted to personal, non-commercial use. [Hobby terms](https://vercel.com/docs/plans/hobby) · [Function limits](https://vercel.com/docs/functions/limitations) · [Cron behavior](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs) |
| Render Node web service plus a background worker and managed PostgreSQL | Evaluate for hosting the Next.js application and a longer-lived runner from the same repository. Render documents Next.js web services, background workers and pgvector support. Confirm extension version, worker memory and CPU, connection budgets, region, backups and recurring cost for the intended pilot. [Next.js hosting](https://render.com/docs/deploy-nextjs-app) · [Workers](https://render.com/docs/background-workers) · [PostgreSQL extensions](https://render.com/docs/postgresql-extensions) |
| Private Cloudflare R2 or another S3-compatible store | R2 is preferred. Test presigned PUT, signed header enforcement, replay-safe staging, signed GET and lifecycle expiry. R2 does not support presigned HTML form POST. Choose a bounded server-mediated path if direct uploads cannot enforce the approved limit, and verify it against the selected host's request constraints. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) |

Select hosting after measuring representative upload sizes, queue depth, OCR and export runtime, connection pooling, region and recovery needs, and recurring costs. Neither candidate is committed. No provisioning is required for Phase 0.

## Main security risks

- **Cross-owner access and stale sessions.** Verify Better Auth sessions centrally, enforce the internal owner in SQL and object signing, and verify revocation and deleting-account behavior.
- **SSRF and unsafe parsing.** Validate each URL and redirect destination, restrict egress, and bound time, size and parser work.
- **Quota races and signed-link replay.** Enforce trial and byte accounting under serialized owner transactions. Bind uploads to private staging, verify originals, and reconcile abandoned and repeated work.
- **External AI exposure.** Check current permission immediately before outbound work, including retries and query embeddings. Minimize shared data and keep secrets and sensitive content out of logs.
- **Duplicate jobs, orphaned files, and export leakage.** Use leases and idempotent state changes, scope archive reads and signed links to the owner, and confirm object removal before dropping cleanup references.

## Decisions still open

- The free allowance in bytes, final paid pricing, and the future upgrade destination and billing provider.
- Retention and recovery policies for existing data after the trial and for deleted items and accounts.
- Supported document formats, per-file limits, parser and OCR engines/languages, export consistency and archive expiry, backup retention, and deletion audit/recovery rules.
- Embedding and optional metadata providers, model/dimension/distance choice, consent granularity and retention of previously generated metadata or vectors after disablement, measured HNSW criteria, and hybrid evaluation targets.
- Production web/DB/worker hosting, R2 confirmation, mail transport, operational limits, and monitoring. Node/package manager versions and test tooling are Phase 0 choices.

## Current handoff

Phase 4 is implemented and ready for review. Phase 5 adds URL capture and background extraction.
