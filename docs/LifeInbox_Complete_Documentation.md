# LifeInbox — Complete Product & Engineering Documentation

*LifeInbox • Project Documentation*

This document combines the approved Markdown chapters. The original DOCX files are historical copies. See the [implementation plan](Implementation_Plan.md) for the repository assessment and delivery phases.

## Chapters

- [Product Requirements](01_PRD_LifeInbox.md)
- [Technical Requirements](02_Technical_Requirements.md)
- [Architecture & Data Flow](03_Architecture_Data_Flow.md)
- [Database Schema](04_Database_Schema.md)
- [API Specification](05_API_Specification.md)
- [Search & Retrieval](06_Search_Retrieval.md)
- [Security & Privacy](07_Security_Privacy.md)
- [MVP Roadmap](08_Roadmap_MVP.md)
- [Validation, Monetisation & Go-to-Market](09_Validation_Monetisation_GTM.md)
- [Project README & Conventions](10_Project_README_Conventions.md)

## Product Requirements

### 1. Product Overview

LifeInbox is a personal information storage and retrieval platform. Its promise is “Save anything. Find it later without remembering its filename, folder, or source.” The MVP supports manual capture of text notes, URLs, images and screenshots, and PDFs and supported documents. Search returns the saved items and their original sources.

### 2. Problem and Goal

Useful information is scattered across browser bookmarks, screenshots, chat messages, downloads, notes and cloud folders. Users often remember the meaning or context of something they saved but forget its exact title or location. Make saving information effortless and make retrieving it faster than remembering where it was stored.

### 3. Target Users

- Students who save study material, links, screenshots, PDFs and project references.
- Developers who save documentation, debugging notes, code references and technical articles.
- Working professionals who save documents, meeting notes, research and useful links.
- General users who repeatedly save screenshots, recommendations, receipts and information for later.

### 4. Core User Stories

- I can manually save a note, URL, image, screenshot, PDF or supported document.
- I can provide and edit titles, tags, descriptions and other user-editable metadata.
- I can find my items by keywords, metadata and filters, then open the original source or download its uploaded file.
- I can see when background processing failed and still access the original item.
- I can see my trial deadline and storage usage, understand why my trial ended, and see the future paid upgrade path.
- I can export my LifeInbox data with the relationships between items, metadata and uploaded files intact.
- I can securely delete my account and its associated LifeInbox data.

### 5. MVP Scope

| Area | Requirement |
|---|---|
| Account | Registration, sign-in, email verification, session handling and recovery with Better Auth. |
| Capture | Manual capture and item creation, viewing, editing and deletion. |
| URL processing | Save the original URL and automatically attempt safe, non-LLM extraction. Index useful extracted text and metadata. |
| File processing | Private uploads with size, type and signature checks. Extract text from supported PDFs and documents and use OCR where appropriate. Show processing status and allow eligible retries. |
| Search | Keyword and metadata search, filters, semantic retrieval with embeddings and pgvector, result previews, and source access. |
| Privacy | Strict user-level data isolation, private files, individual downloads, complete account export and secure account deletion. |
| Trial and quotas | A seven-day free trial ends at the earlier of the time deadline or reaching the configurable per-user storage allowance. Charge original uploaded file bytes. Show usage, the trial end reason and an upgrade prompt. Preserve existing data. |

External AI is optional and user-controlled. When enabled, it may suggest titles, summaries, tags or categories, or generate embeddings. Users can save items, enter titles and tags manually, and use basic keyword search with external AI disabled. Semantic retrieval is an MVP capability for users who enable the relevant embedding processing. Hybrid ranking is Stage 3, a follow-on after keyword/metadata and semantic retrieval are evaluated.

### 6. Out of MVP

- Browser extension, mobile app and share sheet, email forwarding, automatic inbox ingestion and third-party integrations such as calendars.
- Shared or collaborative workspaces, family accounts and complex agentic workflows.
- Reminders, AI chatbot and RAG-generated answers.
- Redis, BullMQ, payment gateway implementation and complex microservices.
- A separate vector database.

### 7. Core Workflow

1. **Capture.** The user manually submits a note, URL or file.
2. **Store.** Persist the item and its source metadata. Keep original uploaded bytes in private object storage.
3. **Process.** Extract text and metadata from supported sources, including URL extraction, PDF extraction and OCR as appropriate. Run external AI enrichment only with the user's permission.
4. **Index.** Make title, tags and available content searchable. Generate and index pgvector embeddings when permitted.
5. **Search.** Match and filter the authenticated user's saved items.
6. **Retrieve.** Open the saved item or original URL, or download the uploaded file.

### 8. Trial and Paid Storage

The free trial ends when seven days elapse or confirmed original upload usage reaches the applicable free allowance, whichever comes first. The duration and allowance are configurable, with seven days as the approved trial duration. Pending reservations reduce upload headroom. A rejected upload by itself does not end the trial. Ending a trial must never silently delete data or restart a trial after space is freed.

Prompt users to upgrade when the trial ends. The proposed safe default restricts new creation and uploads while retaining access to existing data, including export and deletion, under the final access and retention policy. The trial start trigger, exact post-trial access and retention, free byte allowance, and paid prices remain open. Future plans can raise an owner's storage entitlement. MVP excludes checkout and payment processing.

### 9. Non-Functional Requirements

- Keep user data isolated and treat uploads and extracted text as private.
- Measure search latency after a baseline is available. Common searches should feel interactive.
- Make processing failures visible and recoverable while preserving the original item. Track job failures without logging sensitive content.
- Keep database records and binary storage separate. Run expensive processing outside the request lifecycle.

### 10. Success Metrics and Risks

- Track activation by whether new users save at least three items, search-to-open rate, human-rated retrieval relevance, processing success, and return visits at seven and thirty days.
- Validate whether users trust LifeInbox with personal data and return for repeated retrieval. Saving habits, weak relevance, extraction errors, and storage or AI costs can undermine adoption.
- Track conversion to paid storage once pricing and a purchase flow have been validated and launched.

## Technical Requirements

### 1. Stack

| Layer | Technology | Purpose |
|---|---|---|
| Web application and API | Next.js, TypeScript, Tailwind CSS, Next.js Route Handlers | UI and application API within one Next.js app. |
| Database | PostgreSQL and direct parameterized SQL through `pg` | Ownership, Better Auth persistence, application data, jobs, trial state, entitlements, quotas and lexical search. Prisma is excluded. |
| Vector search | pgvector | PostgreSQL-backed embedding storage and similarity retrieval in MVP. No separate vector database. |
| Authentication | Better Auth inside Next.js, persisted to PostgreSQL | Centralized session validation, stable LifeInbox owner resolution, verification, recovery and revocation. See [the authentication boundary](03_Architecture_Data_Flow.md#5-authentication-and-owner-boundary). |
| Object storage | Private S3-compatible storage. Cloudflare R2 is the preferred candidate. | Original uploads and temporary export archives. Store keys and metadata in PostgreSQL. |
| Processing | PostgreSQL-backed jobs | URL and document extraction, OCR and exports. User-enabled AI enrichment and embedding generation use the same mechanism. |
| External AI | Modular provider integration with server-side credentials | Optional titles, summaries, tags, categories and embeddings. |
| Local tooling | Docker or Docker Compose where useful | Reproducible local services, subject to later setup decisions. |

### 2. Engineering Principles

- Authenticate protected Route Handlers centrally, resolve the stable LifeInbox owner, and pass that owner to services and owner-scoped repositories. Use the same owner boundary for jobs, search, files and exports.
- Validate input at application boundaries and parameterize all SQL values. Keep request handlers stateless where practical.
- Keep original files in private object storage and searchable text in PostgreSQL. Sign access only after authorization.
- Claim PostgreSQL jobs atomically, use bounded retries and make job effects idempotent. Recover abandoned leases and expose owner-scoped status and eligible retries. Use source revisions or equivalent checks so stale jobs cannot replace new content.
- Store provider, model, version and dimensions where applicable for derived AI data. Gate external calls on current user permission, including during retries.
- Keep URL extraction, PDF and document text extraction, and OCR independent of external LLM processing. Select supported parsers and OCR tooling during implementation.

### 3. Processing States

| State | Meaning |
|---|---|
| `pending_upload` | A quota reservation exists and an original file has yet to be validated and finalized. |
| `queued` | An item or confirmed original is stored and processing is scheduled. |
| `processing` | A worker is extracting, enriching or indexing current item data. |
| `ready` | Required indexing succeeded. |
| `partial` | Some processing failed. The original and available searchable fields remain usable. |
| `failed` | Required processing failed. Surface the failure and allow an eligible retry. |

A saved item can appear in keyword and metadata results as soon as those fields are indexed. Skipping external AI because a user disabled it is expected and does not make an item partial or failed.

### 4. Search Requirements

- Deliver keyword and metadata search and filters first, then semantic retrieval with embeddings and pgvector before MVP acceptance. Return item ID, title, content type, snippet and useful metadata where available.
- Apply owner and other permitted filters in the database before ranking and output.
- Keep the embedding model behind a provider interface. Match vector dimensions and distance metric to the model and evaluate exact search against HNSW or another pgvector index under realistic owner filters. Hybrid ranking follows as Stage 3.
- Keep query logging privacy-conscious. Chat and generated answers are outside MVP.

### 5. Trial, Quota and Lifecycle

- Compute trial eligibility on the server using the earlier of the seven-day deadline and confirmed upload usage reaching the applicable configurable byte allowance. Persist the end reason and enforce the entitlement on writes without waiting for a scheduled task.
- Reserve, finalize, reconcile and release original file bytes atomically and idempotently. Pending reservations prevent oversubscription. Keep the trial limit and future paid prices configurable, with payment integration outside MVP.
- Authorize individual downloads, complete private exports and secure account deletion. Coordinate deletion with Better Auth, PostgreSQL and object storage through retryable cleanup.

### 6. Reliability and Verification

- Use validated upload reservations and atomic quota accounting. Verify actual size, MIME type and signature before finalizing a file.
- Preserve the original after extraction, OCR or optional enrichment failures. Record structured failures and return user-friendly errors.
- Test input validation, parsers, ranking, authentication and cross-user isolation. Include redirect and URL fetch controls, trial boundaries, upload races and retries, AI-off behavior, owner-isolated lexical and semantic search, file and export authorization, account deletion, and end-to-end capture → search → retrieve.
- Maintain a retrieval evaluation set with known queries and expected items.

## Architecture & Data Flow

### 1. Architecture

The browser uses a single Next.js application for the TypeScript/Tailwind UI and API. Route Handlers resolve a Better Auth session to a stable LifeInbox owner, call services, and use repositories for owner-scoped data access where useful. Better Auth runs inside the app and persists to PostgreSQL. Use direct parameterized SQL via `pg` for application data. PostgreSQL stores owners, saved items and metadata, extracted text, object keys, jobs, quotas, trials, entitlements, exports and pgvector embeddings. Private S3-compatible storage holds originals and temporary export archives. Cloudflare R2 is the preferred initial candidate.

A PostgreSQL-backed job runner handles work outside the request lifecycle. It shares the application's services and can run as a separate process or scheduled consumer of the same queue. Production hosting remains open. A dedicated queue can replace the PostgreSQL job mechanism if measured volume or reliability needs justify it. The MVP excludes a separate Express API, Redis, BullMQ and complex microservices.

### 2. Capture → Store → Process → Index → Search → Retrieve

1. Authenticate the request, resolve the LifeInbox owner and check account state and trial entitlement. The user manually submits a note, URL or file.
2. Persist the item and original URL or note text. For a file, reserve capacity for the owner before authorizing upload, then validate the stored object and finalize its metadata and charge. Store the private object key in PostgreSQL.
3. Queue appropriate processing in PostgreSQL. A URL job attempts safe HTTP(S) fetching and extraction independently of external AI. PDF and document text extraction and OCR run through their own processing paths. Original content remains available when a processing step fails.
4. Normalize extracted text and index it with searchable metadata. Optional user-enabled AI can supply editable metadata or embeddings through a modular provider boundary. Check consent at execution time and keep secrets server-side.
5. Search owner-scoped items by keywords, metadata and filters. For semantic search, embed eligible normalized text and the query through the selected provider interface, then retrieve from pgvector with owner filters. Deliver semantic retrieval in MVP. Hybrid ranking follows as Stage 3.
6. Show a source preview and open the original item or URL. For an uploaded file, issue a short-lived private download link after checking ownership.

### 3. Jobs, Quotas and Exports

- Jobs carry the owner and a resource reference. Workers claim jobs atomically, recheck ownership and resource state, and use retry limits, leases or equivalent recovery, and idempotent writes. URL extraction, PDF extraction, OCR, optional AI metadata and embeddings, deletion cleanup and exports can use the same mechanism.
- A seven-day free trial ends at its deadline or when confirmed original upload bytes reach the configurable allowance, whichever comes first. Serialize entitlement checks, reservations and usage updates for the same owner. Preserve data and show the future paid upgrade path. Derived data and export archives do not consume upload quota. See the [quota accounting rules](04_Database_Schema.md#3-storage-quota-accounting).
- Build large exports asynchronously from owner-scoped records and private originals. Preserve item, tag and file relationships in the manifest. Reauthorize before issuing a temporary private export link and expire the archive. See the [export contract](05_API_Specification.md#6-data-export).
- Account deletion is coordinated by a LifeInbox service. Block access and new work, revoke sessions, and durably track cleanup of PostgreSQL data and private objects. Remove Better Auth records through its supported lifecycle without losing references needed for cleanup.

### 4. Decisions and Rationale

| Decision | Rationale |
|---|---|
| Next.js Route Handlers | Keep the UI and API in one application for the MVP. |
| PostgreSQL with direct SQL through `pg` | Keep data access explicit and retain control over PostgreSQL queries and vector features. Prisma is excluded. |
| pgvector for semantic retrieval | Keep vectors near item data and ownership filters. Benchmark exact search and HNSW as appropriate. MVP uses no separate vector database. |
| Separate private object storage | Keep original binary data out of PostgreSQL. Store references so files can be accessed privately and storage can scale independently. |
| PostgreSQL-backed jobs | OCR, extraction and exports can take longer than a request. PostgreSQL supports the initial queue without another dependency. |
| Lexical and metadata retrieval first | Deliver search with external AI disabled. Ship semantic search with user-controlled embeddings and evaluate hybrid ranking after both layers work. |

### 5. Authentication and Owner Boundary

Better Auth runs in the Next.js application with PostgreSQL persistence. A protected request follows this path.

**Request → verify Better Auth session → resolve active LifeInbox owner → service → owner-scoped SQL or storage operation**

Centralize session and owner resolution. Business services accept the resolved owner context. Trusted jobs use the persisted owner and recheck account and target state. Better Auth's subject ID stays at the identity boundary, so changing auth providers does not require reassigning user resources or entitlements.

Require secure cookies, session handling and revocation, supported password hashing, verification and recovery email, rate limits, secure origin and secret configuration, and authorized account deletion. Use the current official Better Auth guidance when implementing. [Next.js integration](https://better-auth.com/docs/integrations/next) · [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql) · [Security](https://better-auth.com/docs/reference/security)

### 6. Security Boundary

The verified user identity is the data boundary for all queries, searches, jobs, object accesses and exports. Keep file storage private, recheck ownership before signing links, and keep external provider keys server-side. Apply [URL fetching and other security controls](07_Security_Privacy.md) across the application.

### 7. Hosting Constraints

Keep the app portable across suitable Next.js hosts, managed PostgreSQL with pgvector, and private R2/S3-compatible storage. Size a scheduled or separate PostgreSQL job runner against real URL extraction, OCR, embedding and export workloads. Evaluate deployment options during planning before committing to a production host. See the [hosting assessment](Implementation_Plan.md#hosting-assessment).

## Database Schema

### 1. Logical Entities

The following names and fields describe the intended relationships. Final table boundaries and migrations follow implementation review. Use PostgreSQL, direct parameterized SQL via `pg`, and pgvector. Better Auth owns its PostgreSQL schema. Prisma is excluded.

| Entity | Purpose and representative fields |
|---|---|
| `users` | Stable LifeInbox owner ID and account state. Map verified Better Auth identities to owners with a unique provider/subject association. Use the LifeInbox ID for user-owned resources. |
| Better Auth tables | User, account, session and verification records, plus enabled plugin tables. Follow the selected Better Auth version's documented schema. |
| `items` | Owner, content type, title, note text or original URL, description, extracted text/metadata, processing state and timestamps. Preserve user edits and distinguish AI suggestions from user-entered values. |
| `files` | Owner, item ID, original filename, validated MIME type, size in bytes, private object key, optional checksum, processing status and timestamps. Extracted text and metadata may be associated with the file or item. |
| `tags`, `item_tags` | Owner-scoped tags and item/tag associations. Both sides of an association belong to the same owner. |
| `processing_jobs` | Owner, job type, target, status, attempt count, error code, scheduling and lease data, and an idempotency or source revision reference where applicable. |
| `storage_usage` and upload reservations | Per-user confirmed and reserved bytes, configurable allowance or entitlement reference, and reservations linked to their owner and pending object. Track reservation state and expiry. |
| Export records or export job metadata | Owner, state, private archive object key, expiry and error code. A completed export may be linked to a job. |
| Trial and entitlement records | Owner, start time, configured duration, expiration, applicable byte allowance, status and end timestamp/reason. Keep trial state authoritative for MVP. |
| `subscription_plans`, `user_subscriptions` or equivalent | Future-compatible plan and owner entitlement references, byte allowances, configurable pricing, subscription status and effective dates. Payment-provider identifiers are added only when billing is designed. |
| Account deletion state | Owner-bound lifecycle state and resumable cleanup progress. Retain only the minimum references needed for completion and authorized retention. |
| `item_chunks`, `embeddings` | MVP semantic search. Owner-scoped chunks track source order and revision. Embeddings store provider, model/version, dimensions and pgvector values. |

Item types are `note`, `url`, `image`, `pdf` and `document`. Screenshots use the image type. The supported document formats are open.

### 2. Ownership and Indexing

- Each item has one owner. Enforce matching ownership for files, tags, associations, jobs, reservations, export records, trial/entitlement records, chunks and embeddings. Use owner-qualified queries and constraints for relationships where practical.
- Derive ownership from the verified session or from a trusted job bound to an authorized owner. Parameterize SQL. Every resource lookup and mutation includes the owner boundary.
- Index frequently queried ownership, item type, state and timestamp columns as supported by query plans. Use PostgreSQL full-text indexing where appropriate and evaluate index choices against measured queries.
- Scope vector queries by owner and filters. Establish an exact-search baseline and benchmark pgvector HNSW where latency and dataset size justify it. Use a distance operator and index operator class compatible with the model.

### 3. Storage Quota Accounting

The initial accounting basis is validated original uploaded file bytes. Extracted text, metadata, chunks, embeddings and temporary export archives are excluded. Each user has a configurable allowance. The free byte allowance and paid prices are open. The seven-day trial ends at its time deadline or when confirmed bytes first reach the applicable allowance. Reservations consume headroom without ending the trial.

1. Reserve declared bytes in a PostgreSQL transaction before issuing upload permission. Serialize updates for the same owner and check current account and trial entitlement under the same transaction. The sum of confirmed, active reserved and requested bytes must fit within the allowance.
2. Bind each reservation to the owner, expected item, unique pending object key, byte limit and expiry. Enforce the limit on the upload path. If direct-upload signing cannot enforce the required restrictions, use a controlled upload path.
3. Verify the stored object's actual size, type and signature. In a transaction, convert the valid reservation to the actual confirmed charge, finalize file metadata and enqueue processing. Recheck entitlement and expiry at finalization. The valid upload that reaches the cap can finalize and end the trial in the same transaction. Repeated completion must leave counters, trial state and jobs unchanged. Reject oversize or invalid objects and schedule private cleanup.
4. Reconcile abandoned reservations, invalid uploads and interrupted operations. Wait until the upload grant can no longer accept writes and in-flight uploads have settled, then remove staged objects before releasing the reservation. Protect finalized originals from replayed upload grants.
5. On deletion, release charged bytes only after original removal is confirmed. Make cleanup and counter updates idempotent. Reject future uploads when capacity or entitlement is insufficient. Releasing bytes after trial end does not restart the trial.

### 4. Trial State and Entitlements

Use server time for the deadline. Preserve the earliest applicable end event and its reason even if enforcement is first evaluated on a later request. Access checks must remain correct at the deadline without a background task. Record paid entitlement changes separately when billing is introduced. The trial start trigger, in-flight upload behavior at expiration, and post-trial access and retention require policy confirmation. The proposed implementation rechecks eligibility at finalization and reconciles any staged object that cannot be accepted.

### 5. Data Lifecycle

- Create and index the item, attach any validated originals, and update searchable fields as extraction succeeds. Use a source revision or equivalent checks to invalidate stale derived data and jobs after edits.
- Read export data by owner. Retain stable item, file and tag identifiers and their relationships. Export records and archive references also belong to that owner.
- Item deletion immediately removes access and search visibility. Account deletion blocks the owner, revokes sessions, invalidates outstanding work, and uses durable cleanup for originals, exports, derived data, jobs, metadata and application records. Remove Better Auth records through the supported lifecycle. Keep cleanup references until object removal is confirmed. Backup expiry, retention and any recovery window remain open.

## API Specification

### 1. Conventions

The application API uses Next.js Route Handlers under `/api/v1`. The routes below are proposed contracts. JSON requests use validated input, and failures use stable error codes, messages and optional field details. Verify Better Auth sessions through the centralized request boundary and resolve the stable LifeInbox owner before calling a service. Check owner and account state before each resource operation. Gate new writes and uploads on the applicable trial or paid entitlement. A client-supplied user ID is never authorization.

### 2. Authentication and Account Settings

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/me` | Return profile, external AI settings, confirmed and reserved bytes, applicable allowance, trial deadline, status, end reason and future upgrade eligibility. |
| PATCH | `/api/v1/me/settings` | Update user-controlled settings, including external AI permission where AI is available. |

Better Auth serves sign-up, sign-in, email verification, recovery, sign-out and session operations through its Next.js handler. Application routes use its verified session to resolve a LifeInbox owner. Use current Better Auth documentation when implementing the provider routes.

### 3. Items

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/items` | Manually create an item. Persist an original URL before scheduling safe non-LLM extraction. |
| GET | `/api/v1/items` | List and filter the owner's items. |
| GET | `/api/v1/items/:id` | Read the owned item and processing status. |
| PATCH | `/api/v1/items/:id` | Update allowed content, titles, tags and other editable metadata. Reindex affected fields. |
| DELETE | `/api/v1/items/:id` | Remove access and initiate cleanup of originals and derived data. |

For processing status, return the current state and a safe error code if available. A proposed `POST /api/v1/items/:id/retry` accepts an eligible owner-scoped retry and deduplicates concurrent requests.

### 4. Files

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/uploads/presign` | Validate the owned target item, file metadata and capacity. Check trial entitlement, reserve bytes atomically and return time-limited upload instructions. A controlled upload path can be used when direct-upload restrictions cannot be enforced. |
| POST | `/api/v1/items/:id/files/complete` | Verify reservation ownership, current entitlement and actual object size, MIME type and signature. Finalize once, charge actual bytes, record trial end if the limit is reached, and enqueue processing. |
| GET | `/api/v1/items/:id/files` | List authorized file metadata. |
| GET | `/api/v1/files/:id/download` | Recheck ownership and availability, then issue a short-lived signed download or redirect. |

Distinguish an upload that would exceed remaining capacity from a trial that has ended. Return a stable reason and account-specific limit information. A seven-day deadline or confirmed original bytes reaching the configurable allowance ends the trial, whichever comes first. Show an upgrade prompt while preserving data. Checkout is outside MVP. Download responses use safe filenames and keep underlying objects private. See the [quota accounting rules](04_Database_Schema.md#3-storage-quota-accounting).

### 5. Search

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/search` | Stage 1 keyword and metadata search over the owner's items with type, tag and date filters as supported. |
| POST | `/api/v1/search/semantic` | Proposed Stage 2 MVP endpoint. Validate embedding permission and search owner-scoped pgvector candidates with supported filters. |

Return item ID, title, content type, snippet, relevant metadata, and relevance or match information where useful. Users can open the underlying item or source. Hybrid ranking follows as Stage 3 after evaluating both retrieval modes. The MVP has no chatbot or answer-generation endpoint.

### 6. Data Export

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/exports` | Request a complete LifeInbox data export. Queue large exports using PostgreSQL jobs. |
| GET | `/api/v1/exports/:id` | Return the owner's export state, availability and expiry. |
| GET | `/api/v1/exports/:id/download` | Recheck ownership, readiness and expiry, then issue a short-lived private download link. |

The export includes saved item content and metadata, original files, tags and assignments, and user-facing settings. Preserve item-to-file and tag relationships using stable IDs and manifest paths. One possible layout uses `metadata/items.json`, `tags.json`, `user-settings.json`, `notes/`, `images/`, `documents/` and `README.txt`. Exclude auth credentials, password hashes, session tokens, secrets and signed URLs. The precise archive schema, consistency rules for concurrent edits and retention window remain open.

### 7. Account Deletion

A proposed `DELETE /api/v1/me` verifies recent authentication, resolves the owner, blocks access, revokes sessions and durably initiates retryable cleanup. Repeated requests or job attempts must be safe. Coordinate Better Auth identity deletion with removal of application data, private originals, embeddings, jobs and export archives. Preserve only the cleanup state and minimal references needed for completion and the approved retention policy.

## Search & Retrieval

### 1. Stage 1 — Keyword and Metadata Retrieval

Search returns saved items and their sources. Support keyword search over available note and extracted text, metadata search over titles, tags and other searchable fields, and filters such as type, tag and date. Return useful snippets and let users open the saved item, original URL or authorized file download.

Search and saving must work with external AI disabled. A saved URL is indexed from its original URL, manual metadata and any useful content extracted without an LLM. File text extraction and OCR are separate from external AI processing.

### 2. Indexing and Ownership

1. Persist the saved item's available text and metadata.
2. Extract text from supported sources, normalize whitespace and retain useful source metadata. Preserve user-entered titles and tags when adding suggestions.
3. Index available searchable fields in PostgreSQL and update them when the item changes.
4. Filter the candidate set to the authenticated owner and requested filters before ranking or returning results. Recheck authorization when the source is opened.

If enrichment is skipped or extraction fails, the original remains available and existing indexed fields can still be retrieved.

### 3. Stage 2 — MVP Semantic Retrieval

- Use embeddings and PostgreSQL pgvector to find related material even when exact terms differ. Keep generation behind a provider interface. Verify current user permission before embedding user content or a query with an external provider, including retries. The MVP uses no separate vector database.
- Use deterministic chunks with overlap only where useful. Record source revision, model, provider, version and dimensions. Index vectors only for the owner's content, skip re-embedding unchanged text and use asynchronous indexing.
- Keep query and indexed vectors compatible by model/version and dimension. Select the distance metric with the model. Start with exact owner-filtered similarity as a baseline. Evaluate HNSW and recall under realistic owner and metadata filters before adding an approximate index. Plan reindexing when changing model or dimensions. [pgvector indexing and filtering](https://github.com/pgvector/pgvector#indexing)
- Deliver semantic retrieval for eligible users before MVP acceptance. Keep the Stage 1 search path available when embeddings are disabled, unavailable or still processing.

### 4. Stage 3 — Hybrid Search

Evaluate hybrid retrieval as a follow-on after both MVP layers are available. Combine owner-scoped lexical and vector candidates. Candidate approaches include weighted scores and reciprocal-rank fusion. Tune against a relevance set and measure the additional cost and latency before making a choice.

### 5. Queries and Evaluation

- Exact lookup example. “Docker deployment”
- Semantic lookup example. “the article about deploying a Node app with containers”
- Contextual lookup example. “the cafe I saved for a birthday”

| Metric | What to measure |
|---|---|
| Recall@K | Whether relevant saved items appear in the top K results. |
| Precision@K | How many of the top results are relevant. |
| Mean reciprocal rank | How near the top the first relevant item appears. |
| Search-to-open rate | How often a search leads to opening a result. |
| Failed searches | Common queries that yield zero results or miss an expected item. |

Keep retrieval independent of answer generation. Chatbots and RAG-generated answers are outside MVP. Any future proposal for generated answers would need a separate scope decision and evaluation of source attribution, unsupported claims and abstention when evidence is missing.

## Security & Privacy

### 1. Identity and Data Isolation

- Centralize Better Auth session validation and resolution of the active LifeInbox owner for every protected Route Handler. Treat item IDs, object keys and client-supplied user IDs as untrusted input.
- Use secure cookies, trusted origins, supported password hashing, email verification, recovery and revocation. Keep secrets server-side and apply appropriate rate limits for sign-in, recovery and sensitive actions across deployed instances. Check recent authentication for account deletion.
- Scope all user-data queries, searches, processing jobs, file access and exports to that owner. Verify resource relationships before access or writes. Apply ownership before ranking and before issuing any file or export link.
- Use parameterized SQL, validate inputs and allow-list dynamic options such as sort fields. Test that guessed IDs and malformed or mismatched relationships cannot access another user's data.

### 2. Uploads, Downloads and Quotas

- Allow-list supported types and extensions. Enforce configurable size limits and verify actual size, MIME type and file signature before accepting an upload. Client declarations are preliminary.
- Generate storage keys independently of user-supplied filenames. Sanitize display and download filenames and prevent path traversal in files and export entries. Treat documents as untrusted, apply parser resource limits, and never execute uploaded content. Evaluate malware scanning where it can reduce risk.
- Keep originals and export archives in private S3-compatible storage. Persist keys server-side. Authorize each access before issuing a short-lived signed URL. Treat signed links as bearer credentials and keep them out of logs.
- Enforce configurable quotas and the seven-day-or-storage trial boundary per owner. End the trial at the earlier of the deadline and confirmed original bytes reaching the allowance. Reserve bytes atomically before permitting upload, recheck at finalization, and reconcile abandoned or failed uploads. Prevent races and replay, enforce restricted writes after trial end according to policy, and preserve existing data.

### 3. Safe URL Fetching

- Accept HTTP(S) URLs for extraction and validate the parsed scheme, host and port. Fetch in a restricted server-side job with no browser session cookies, internal credentials or ambient authentication.
- Deny loopback, private, link-local, reserved and other non-public addresses, internal hosts and cloud metadata endpoints. Check both IPv4 and IPv6 DNS answers and ensure connections use a validated destination. Guard against DNS rebinding and verify the original hostname for TLS.
- Bound redirects and validate every redirect target and its resolved destination before connecting. Block unsafe schemes and private or internal destinations at every hop. Use network egress restrictions as defense in depth.
- Enforce connection and overall time limits, response-size limits including decompressed bytes, and allowed response MIME types. Parse only supported content without executing scripts or fetching unvalidated embedded resources.
- Preserve the original URL and expose a safe processing status if extraction is blocked, fails or yields unsupported content. Saving and lexical search remain available.

### 4. External AI and Privacy

- External AI requires the user to enable it. Explain the providers, content and purposes involved before enabling it, including when item text, images, metadata or search queries may leave LifeInbox. Explain provider retention and use of data as part of the integration evaluation.
- Check current permission before sending data, including in queued jobs, retries and semantic queries. When external AI is disabled, send no user content to it. Users can still save items, set titles and tags manually and search by keyword.
- Keep provider API keys server-side. Send the minimum necessary data. Keep full prompts, source documents and generated output out of routine logs. Using user data for provider training would require explicit consent and compatible product and provider terms.
- Treat webpage and document text as untrusted input to optional enrichment. Keep application instructions separate, validate generated metadata and prohibit model output from driving privileged actions or cross-user access.
- PDF text extraction, OCR and URL extraction can run independently of external LLMs. Evaluate any external non-LLM processing service for privacy before sending private content to it.

### 5. Processing and Export Authorization

- Queue jobs with an authorized owner and resource reference. Workers recheck ownership and current state, use restricted credentials, apply execution limits and make retries safe. Record operational errors without including sensitive content.
- Authenticate export requests and scope every included record and file to the requesting owner. Exclude auth credentials and password hashes. Verify ownership, account state and archive state before issuing a short-lived private link. Expire and remove temporary archives and block new access after expiry.

### 6. Deletion and Retention

Item deletion removes it from access and search immediately and initiates cleanup. Account deletion is a LifeInbox-owned workflow. Verify recent authentication and ownership, mark the account as deleting, block requests and new jobs, and revoke Better Auth sessions. Cancel or invalidate stale work so it cannot recreate data. Use durable, retryable cleanup for private originals and export archives, extracted text, embeddings, metadata, jobs and application records. Delete Better Auth identity records through the supported lifecycle. Keep the owner and object references needed for cleanup until removal is confirmed, then retain only approved audit state. Release charged bytes only after the original object is gone.

Define retention for post-trial access, objects awaiting cleanup, affected export archives, backups and any recovery window before release. Trial expiry alone never triggers deletion. Stop issuing links for deleted originals. Existing signed links can remain usable until expiration or object removal, so keep their lifetime short.

### 7. Security Verification

Test broken object-level authorization, cross-user search and job execution, malicious uploads and filenames, signed-link expiry, export isolation, concurrent uploads, both trial end conditions, cleanup retries, attempts to regain access during account deletion, and account or session abuse. Exercise URL redirect, DNS and resource-limit protections. Verify that disabling external AI prevents outbound AI calls and that operational logs omit sensitive data.

## MVP Roadmap

### 1. Validate the Workflow

- Interview five to ten potential users about what they save and what they struggle to find. Use a lightweight clickable prototype to test manual capture and retrieval.
- Confirm the pilot's supported document formats, configurable free storage allowance, trial start trigger and post-trial access and retention policy. Keep paid prices open.
- Evaluate Next.js hosting, managed PostgreSQL with pgvector, private R2/S3-compatible storage and a PostgreSQL job runner. Cloudflare R2 is the preferred storage candidate.

### 2. Build the MVP in Reviewable Increments

1. Establish the Next.js, TypeScript and Tailwind foundation and local verification workflow.
2. Add Better Auth, PostgreSQL persistence and the LifeInbox owner boundary. Establish direct SQL data access and owner-scoped application records.
3. Establish the seven-day-or-storage trial and entitlement policy before enabling capture writes. Add manual notes, automatic safe URL extraction and PostgreSQL jobs.
4. Add private image/PDF/document uploads, concurrency-safe byte accounting, PDF extraction and OCR. Show job status and eligible retries.
5. Deliver keyword and metadata search with filters first. Add semantic retrieval with embeddings and pgvector before MVP acceptance. Deliver optional user-controlled AI metadata without making it a dependency for saving or lexical search.
6. Add individual downloads, complete account export and secure account deletion. Run security and reliability verification, then prepare the pilot.

See the [implementation plan](Implementation_Plan.md) for phase prerequisites, likely files, tests, acceptance gates and hosting trade-offs.

### 3. Definition of MVP Done

- Verified users can register, sign in, recover access, sign out and manually save supported content. Every user-data operation is scoped to a stable LifeInbox owner.
- Safe URL extraction, PDF extraction and OCR run through observable PostgreSQL jobs. Processing failures are visible and eligible jobs can be retried.
- Keyword and metadata search with filters work with external AI disabled. Semantic search through pgvector works with permitted embeddings. Search results open the actual saved source.
- Concurrent uploads respect the configurable per-user allowance. The trial ends at the earlier of seven days or confirmed original file bytes reaching the limit. The UI explains the end reason and upgrade path. The application preserves existing data and enforces the agreed post-trial policy.
- Files and archives stay private. Users can download individual files, export complete account data, and securely delete their accounts with retryable cleanup.
- Auth, SSRF, privacy, ownership, quota, deletion and end-to-end tests pass. A small real-user pilot measures capture, retrieval and processing success.

### 4. Follow-on Scope

- Hybrid ranking is Stage 3. Evaluate it after measuring both MVP retrieval modes.
- Add paid storage entitlements and payment integration in a future release. MVP supports an upgrade prompt and a provider-neutral entitlement design.
- Browser extensions, mobile apps, email forwarding, third-party integrations, reminders, AI chat, RAG-generated answers, shared spaces and complex microservices are outside MVP. Redis, BullMQ and separate vector databases are outside the initial architecture.

## Validation, Monetisation & Go-to-Market

### 1. Core Hypothesis

People have enough scattered information that they repeatedly need to retrieve it later, and they will adopt a dedicated tool if saving is effortless and retrieval is materially better than their current workflow.

### 2. Validation Questions

1. What kinds of information do people save most often, and where do they save it today?
2. How often do they fail to find something they saved, and which scenarios are most frustrating?
3. Do keyword search, metadata search and filters across mixed content help them find it faster?
4. Which failed keyword searches improve with MVP semantic retrieval, and when would hybrid ranking add value?
5. Would they trust LifeInbox to store personal files? How do privacy, individual downloads, complete export and deletion affect that trust?
6. How much original upload storage do they need, and would they pay for more?

### 3. Initial Target Segment

Students and developers are a practical first segment because they frequently save technical articles, documentation, screenshots, PDFs and project references and are accessible for early testing. Validate the segment before treating it as the final market.

### 4. Monetisation Hypothesis

- The seven-day free trial ends when the time limit expires or confirmed original uploaded file bytes reach the user's configurable free allowance, whichever comes first. The exact free allowance is open.
- Future paid storage can increase a user's allowance. Validate pricing and allowances with real usage and cost data before committing.
- Explain when an upload does not fit and why a trial has ended. Prompt users to upgrade and preserve existing data under the final post-trial access and retention policy. The MVP excludes checkout, billing and payment gateway implementation. Future billing events update provider-neutral LifeInbox entitlements.
- Treat possible paid enhancements beyond storage as separate hypotheses. Advanced search and optional AI may affect cost and willingness to pay. Their tiering has not been decided.

### 5. Acquisition Ideas

- Developer and student communities.
- Demos showing how to find a saved screenshot, PDF or link in seconds using keywords and filters.
- Short videos showing manual capture followed by extraction and retrieval.
- Referral incentives after a user successfully retrieves useful content.
- A public landing page with example searches.

### 6. Metrics to Watch

- Items saved per activated user, searches per active user, search-to-open rate and failed searches.
- Percentage of users returning within seven and thirty days.
- Processing failure rate, storage per active user, and trial endings by time or storage allowance.
- Optional AI costs if AI is enabled. Paid-storage interest during validation and conversion once a paid offering exists.

### 7. Biggest Business Risk

The product may be useful without becoming a habit. The strongest validation signal is repeated retrieval. Users should come back because they trust LifeInbox to contain information they will need later.

## Project README & Conventions

### 1. Project Definition

LifeInbox is a personal information storage and retrieval platform. Its MVP supports manual capture of text notes, URLs, images/screenshots, and PDFs and supported documents. The core workflow is capture → store → process → index → search → retrieve.

### 2. Repository and Application Structure

This repository currently contains project documentation under `docs/`. The approved architecture is a single Next.js application using TypeScript, Tailwind CSS and Route Handlers. Use Route Handlers → services → repositories/data access where useful. Keep Better Auth, database, storage, processing and optional AI modules server-side. The PostgreSQL-backed job runner shares application logic. Its execution model and exact directory layout remain open.

Start with the [PRD](01_PRD_LifeInbox.md), [architecture](03_Architecture_Data_Flow.md), [security requirements](07_Security_Privacy.md) and [roadmap](08_Roadmap_MVP.md). The [complete documentation](LifeInbox_Complete_Documentation.md) mirrors the individual Markdown chapters. The [implementation plan](Implementation_Plan.md) records phase boundaries and acceptance criteria. The original DOCX files are historical copies.

### 3. Development Rules

- Validate input at API boundaries. Use direct parameterized SQL via `pg`. Use PostgreSQL and pgvector. Prisma is excluded.
- Centralize Better Auth session validation and resolve a stable LifeInbox owner before calling services. Jobs carry the same owner ID. Scope queries, search, jobs, files, exports and entitlements to that owner.
- Keep uploaded files private. Store object keys in PostgreSQL and authorize short-lived links. Treat quota reservation, finalization, retries and cleanup as one accounting lifecycle. Enforce the earlier of the seven-day trial deadline and the configurable storage limit. Preserve data and prompt for a future upgrade.
- Keep URL, PDF and OCR processing independent of external LLMs. Use modular optional AI providers, version prompts and models where practical, check user consent and keep credentials server-side.
- Prefer incremental features and explicit data access. Verify ownership, search relevance, safe ingestion, quota concurrency, export and deletion behavior.

### 4. Configuration Examples

- PostgreSQL connection, such as `DATABASE_URL`.
- Better Auth server-side settings, PostgreSQL persistence, secrets, trusted origins, verification and recovery mail.
- Private S3-compatible storage endpoint, region, bucket and server-side credentials. Cloudflare R2 is the preferred candidate.
- Configurable trial duration (seven days), per-user byte allowance, future prices, supported formats and size limits, job retries, link expiry and retention.
- Optional AI provider credentials and model configuration, such as `LLM_API_KEY` and `EMBEDDING_MODEL`. The core workflow must run without AI credentials.

### 5. MVP Development Order

Start with the local application foundation. Then establish Better Auth, the stable owner boundary, SQL data access, and trial eligibility before user writes. Add capture, safe processing and quota enforcement, then keyword and metadata retrieval followed by MVP semantic retrieval. Finish downloads, exports, secure account deletion and pilot verification. Follow the [implementation plan](Implementation_Plan.md) and [MVP roadmap](08_Roadmap_MVP.md).

### 6. Scope

The MVP includes semantic retrieval using pgvector and optional user-controlled AI metadata. It excludes browser extensions, mobile apps, email forwarding, third-party product integrations, reminders, AI chat, RAG-generated answers, Redis, BullMQ, a separate vector database, complex microservices and payment integration. Hybrid search is Stage 3. Paid storage purchases are future work.
