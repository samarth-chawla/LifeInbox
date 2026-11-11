# LifeInbox — Technical Requirements & Engineering Specification

*LifeInbox • Project Documentation*

## 1. Stack

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

## 2. Engineering Principles

- Authenticate protected Route Handlers centrally, resolve the stable LifeInbox owner, and pass that owner to services and owner-scoped repositories. Use the same owner boundary for jobs, search, files and exports.
- Validate input at application boundaries and parameterize all SQL values. Keep request handlers stateless where practical.
- Keep original files in private object storage and searchable text in PostgreSQL. Sign access only after authorization.
- Claim PostgreSQL jobs atomically, use bounded retries and make job effects idempotent. Recover abandoned leases and expose owner-scoped status and eligible retries. Use source revisions or equivalent checks so stale jobs cannot replace new content.
- Store provider, model, version and dimensions where applicable for derived AI data. Gate external calls on current user permission, including during retries.
- Keep URL extraction, PDF and document text extraction, and OCR independent of external LLM processing. Select supported parsers and OCR tooling during implementation.

## 3. Processing States

| State | Meaning |
|---|---|
| `pending_upload` | A quota reservation exists and an original file has yet to be validated and finalized. |
| `queued` | An item or confirmed original is stored and processing is scheduled. |
| `processing` | A worker is extracting, enriching or indexing current item data. |
| `ready` | Required indexing succeeded. |
| `partial` | Some processing failed. The original and available searchable fields remain usable. |
| `failed` | Required processing failed. Surface the failure and allow an eligible retry. |

A saved item can appear in keyword and metadata results as soon as those fields are indexed. Skipping external AI because a user disabled it is expected and does not make an item partial or failed.

## 4. Search Requirements

- Deliver keyword and metadata search and filters first, then semantic retrieval with embeddings and pgvector before MVP acceptance. Return item ID, title, content type, snippet and useful metadata where available.
- Apply owner and other permitted filters in the database before ranking and output.
- Keep the embedding model behind a provider interface. Match vector dimensions and distance metric to the model and evaluate exact search against HNSW or another pgvector index under realistic owner filters. Hybrid ranking follows as Stage 3.
- Keep query logging privacy-conscious. Chat and generated answers are outside MVP.

## 5. Trial, Quota and Lifecycle

- Compute trial eligibility on the server using the earlier of the seven-day deadline and confirmed upload usage reaching the applicable configurable byte allowance. Persist the end reason and enforce the entitlement on writes without waiting for a scheduled task.
- Reserve, finalize, reconcile and release original file bytes atomically and idempotently. Pending reservations prevent oversubscription. Keep the trial limit and future paid prices configurable, with payment integration outside MVP.
- Authorize individual downloads, complete private exports and secure account deletion. Coordinate deletion with Better Auth, PostgreSQL and object storage through retryable cleanup.

## 6. Reliability and Verification

- Use validated upload reservations and atomic quota accounting. Verify actual size, MIME type and signature before finalizing a file.
- Preserve the original after extraction, OCR or optional enrichment failures. Record structured failures and return user-friendly errors.
- Test input validation, parsers, ranking, authentication and cross-user isolation. Include redirect and URL fetch controls, trial boundaries, upload races and retries, AI-off behavior, owner-isolated lexical and semantic search, file and export authorization, account deletion, and end-to-end capture → search → retrieve.
- Maintain a retrieval evaluation set with known queries and expected items.
