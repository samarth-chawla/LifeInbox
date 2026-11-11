# LifeInbox — MVP Roadmap & Delivery Plan

*LifeInbox • Project Documentation*

## 1. Validate the Workflow

- Interview five to ten potential users about what they save and what they struggle to find. Use a lightweight clickable prototype to test manual capture and retrieval.
- Confirm the pilot's supported document formats, configurable free storage allowance, trial start trigger and post-trial access and retention policy. Keep paid prices open.
- Evaluate Next.js hosting, managed PostgreSQL with pgvector, private R2/S3-compatible storage and a PostgreSQL job runner. Cloudflare R2 is the preferred storage candidate.

## 2. Build the MVP in Reviewable Increments

1. Establish the Next.js, TypeScript and Tailwind foundation and local verification workflow.
2. Add Better Auth, PostgreSQL persistence and the LifeInbox owner boundary. Establish direct SQL data access and owner-scoped application records.
3. Establish the seven-day-or-storage trial and entitlement policy before enabling capture writes. Add manual notes, automatic safe URL extraction and PostgreSQL jobs.
4. Add private image/PDF/document uploads, concurrency-safe byte accounting, PDF extraction and OCR. Show job status and eligible retries.
5. Deliver keyword and metadata search with filters first. Add semantic retrieval with embeddings and pgvector before MVP acceptance. Deliver optional user-controlled AI metadata without making it a dependency for saving or lexical search.
6. Add individual downloads, complete account export and secure account deletion. Run security and reliability verification, then prepare the pilot.

See the [implementation plan](Implementation_Plan.md) for phase prerequisites, likely files, tests, acceptance gates and hosting trade-offs.

## 3. Definition of MVP Done

- Verified users can register, sign in, recover access, sign out and manually save supported content. Every user-data operation is scoped to a stable LifeInbox owner.
- Safe URL extraction, PDF extraction and OCR run through observable PostgreSQL jobs. Processing failures are visible and eligible jobs can be retried.
- Keyword and metadata search with filters work with external AI disabled. Semantic search through pgvector works with permitted embeddings. Search results open the actual saved source.
- Concurrent uploads respect the configurable per-user allowance. The trial ends at the earlier of seven days or confirmed original file bytes reaching the limit. The UI explains the end reason and upgrade path. The application preserves existing data and enforces the agreed post-trial policy.
- Files and archives stay private. Users can download individual files, export complete account data, and securely delete their accounts with retryable cleanup.
- Auth, SSRF, privacy, ownership, quota, deletion and end-to-end tests pass. A small real-user pilot measures capture, retrieval and processing success.

## 4. Follow-on Scope

- Hybrid ranking is Stage 3. Evaluate it after measuring both MVP retrieval modes.
- Add paid storage entitlements and payment integration in a future release. MVP supports an upgrade prompt and a provider-neutral entitlement design.
- Browser extensions, mobile apps, email forwarding, third-party integrations, reminders, AI chat, RAG-generated answers, shared spaces and complex microservices are outside MVP. Redis, BullMQ and separate vector databases are outside the initial architecture.
