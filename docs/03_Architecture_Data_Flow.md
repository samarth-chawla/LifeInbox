# LifeInbox — System Architecture & Data Flow

*LifeInbox • Project Documentation*

## 1. Architecture

The browser uses a single Next.js application for the TypeScript/Tailwind UI and API. Route Handlers resolve a Better Auth session to a stable LifeInbox owner, call services, and use repositories for owner-scoped data access where useful. Better Auth runs inside the app and persists to PostgreSQL. Use direct parameterized SQL via `pg` for application data. PostgreSQL stores owners, saved items and metadata, extracted text, object keys, jobs, quotas, trials, entitlements, exports and pgvector embeddings. Private S3-compatible storage holds originals and temporary export archives. Cloudflare R2 is the preferred initial candidate.

A PostgreSQL-backed job runner handles work outside the request lifecycle. It shares the application's services and can run as a separate process or scheduled consumer of the same queue. Production hosting remains open. A dedicated queue can replace the PostgreSQL job mechanism if measured volume or reliability needs justify it. The MVP excludes a separate Express API, Redis, BullMQ and complex microservices.

## 2. Capture → Store → Process → Index → Search → Retrieve

1. Authenticate the request, resolve the LifeInbox owner and check account state and trial entitlement. The user manually submits a note, URL or file.
2. Persist the item and original URL or note text. For a file, reserve capacity for the owner before authorizing upload, then validate the stored object and finalize its metadata and charge. Store the private object key in PostgreSQL.
3. Queue appropriate processing in PostgreSQL. A URL job attempts safe HTTP(S) fetching and extraction independently of external AI. PDF and document text extraction and OCR run through their own processing paths. Original content remains available when a processing step fails.
4. Normalize extracted text and index it with searchable metadata. Optional user-enabled AI can supply editable metadata or embeddings through a modular provider boundary. Check consent at execution time and keep secrets server-side.
5. Search owner-scoped items by keywords, metadata and filters. For semantic search, embed eligible normalized text and the query through the selected provider interface, then retrieve from pgvector with owner filters. Deliver semantic retrieval in MVP. Hybrid ranking follows as Stage 3.
6. Show a source preview and open the original item or URL. For an uploaded file, issue a short-lived private download link after checking ownership.

## 3. Jobs, Quotas and Exports

- Jobs carry the owner and a resource reference. Workers claim jobs atomically, recheck ownership and resource state, and use retry limits, leases or equivalent recovery, and idempotent writes. URL extraction, PDF extraction, OCR, optional AI metadata and embeddings, deletion cleanup and exports can use the same mechanism.
- A seven-day free trial ends at its deadline or when confirmed original upload bytes reach the configurable allowance, whichever comes first. Serialize entitlement checks, reservations and usage updates for the same owner. Preserve data and show the future paid upgrade path. Derived data and export archives do not consume upload quota. See the [quota accounting rules](04_Database_Schema.md#3-storage-quota-accounting).
- Build large exports asynchronously from owner-scoped records and private originals. Preserve item, tag and file relationships in the manifest. Reauthorize before issuing a temporary private export link and expire the archive. See the [export contract](05_API_Specification.md#6-data-export).
- Account deletion is coordinated by a LifeInbox service. Block access and new work, revoke sessions, and durably track cleanup of PostgreSQL data and private objects. Remove Better Auth records through its supported lifecycle without losing references needed for cleanup.

## 4. Decisions and Rationale

| Decision | Rationale |
|---|---|
| Next.js Route Handlers | Keep the UI and API in one application for the MVP. |
| PostgreSQL with direct SQL through `pg` | Keep data access explicit and retain control over PostgreSQL queries and vector features. Prisma is excluded. |
| pgvector for semantic retrieval | Keep vectors near item data and ownership filters. Benchmark exact search and HNSW as appropriate. MVP uses no separate vector database. |
| Separate private object storage | Keep original binary data out of PostgreSQL. Store references so files can be accessed privately and storage can scale independently. |
| PostgreSQL-backed jobs | OCR, extraction and exports can take longer than a request. PostgreSQL supports the initial queue without another dependency. |
| Lexical and metadata retrieval first | Deliver search with external AI disabled. Ship semantic search with user-controlled embeddings and evaluate hybrid ranking after both layers work. |

## 5. Authentication and Owner Boundary

Better Auth runs in the Next.js application with PostgreSQL persistence. A protected request follows this path.

**Request → verify Better Auth session → resolve active LifeInbox owner → service → owner-scoped SQL or storage operation**

Centralize session and owner resolution. Business services accept the resolved owner context. Trusted jobs use the persisted owner and recheck account and target state. Better Auth's subject ID stays at the identity boundary, so changing auth providers does not require reassigning user resources or entitlements.

Require secure cookies, session handling and revocation, supported password hashing, verification and recovery email, rate limits, secure origin and secret configuration, and authorized account deletion. Use the current official Better Auth guidance when implementing. [Next.js integration](https://better-auth.com/docs/integrations/next) · [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql) · [Security](https://better-auth.com/docs/reference/security)

## 6. Security Boundary

The verified user identity is the data boundary for all queries, searches, jobs, object accesses and exports. Keep file storage private, recheck ownership before signing links, and keep external provider keys server-side. Apply [URL fetching and other security controls](07_Security_Privacy.md) across the application.

## 7. Hosting Constraints

Keep the app portable across suitable Next.js hosts, managed PostgreSQL with pgvector, and private R2/S3-compatible storage. Size a scheduled or separate PostgreSQL job runner against real URL extraction, OCR, embedding and export workloads. Evaluate deployment options during planning before committing to a production host. See the [hosting assessment](Implementation_Plan.md#hosting-assessment).
