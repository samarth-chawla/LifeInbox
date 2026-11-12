# LifeInbox — Database Schema Specification

*LifeInbox • Project Documentation*

## 1. Logical Entities

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

## 2. Ownership and Indexing

- Each item has one owner. Enforce matching ownership for files, tags, associations, jobs, reservations, export records, trial/entitlement records, chunks and embeddings. Use owner-qualified queries and constraints for relationships where practical.
- Derive ownership from the verified session or from a trusted job bound to an authorized owner. Parameterize SQL. Every resource lookup and mutation includes the owner boundary.
- Index frequently queried ownership, item type, state and timestamp columns as supported by query plans. Use PostgreSQL full-text indexing where appropriate and evaluate index choices against measured queries.
- Scope vector queries by owner and filters. Establish an exact-search baseline and benchmark pgvector HNSW where latency and dataset size justify it. Use a distance operator and index operator class compatible with the model.

## 3. Storage Quota Accounting

The initial accounting basis is validated original uploaded file bytes. Extracted text, metadata, chunks, embeddings and temporary export archives are excluded. Each user has a configurable allowance. The free byte allowance and paid prices are open. The seven-day trial ends at its time deadline or when confirmed bytes first reach the applicable allowance. Reservations consume headroom without ending the trial.

1. Reserve declared bytes in a PostgreSQL transaction before issuing upload permission. Serialize updates for the same owner and check current account and trial entitlement under the same transaction. The sum of confirmed, active reserved and requested bytes must fit within the allowance.
2. Bind each reservation to the owner, expected item, unique pending object key, byte limit and expiry. Enforce the limit on the upload path. If direct-upload signing cannot enforce the required restrictions, use a controlled upload path.
3. Verify the stored object's actual size, type and signature. In a transaction, convert the valid reservation to the actual confirmed charge, finalize file metadata and enqueue processing. Recheck entitlement and expiry at finalization. The valid upload that reaches the cap can finalize and end the trial in the same transaction. Repeated completion must leave counters, trial state and jobs unchanged. Reject oversize or invalid objects and schedule private cleanup.
4. Reconcile abandoned reservations, invalid uploads and interrupted operations. Wait until the upload grant can no longer accept writes and in-flight uploads have settled, then remove staged objects before releasing the reservation. Protect finalized originals from replayed upload grants.
5. On deletion, release charged bytes only after original removal is confirmed. Make cleanup and counter updates idempotent. Reject future uploads when capacity or entitlement is insufficient. Releasing bytes after trial end does not restart the trial.

## 4. Trial State and Entitlements

Use server time for the deadline. Start a trial once on the first successful verified sign-in, or on the first account request after rollout for an existing signed-in owner. Snapshot the allowance at that point. Preserve the earliest applicable end event and its reason even if enforcement is first evaluated on a later request. Access checks remain correct at the deadline without a background task. After expiry, preserve read, search, export and deletion access to existing data and block new saves and uploads. Recheck eligibility at finalization and clean up staged objects that cannot be accepted before releasing their reservations. Record paid entitlement changes separately when billing is introduced.

## 5. Data Lifecycle

- Create and index the item, attach any validated originals, and update searchable fields as extraction succeeds. Use a source revision or equivalent checks to invalidate stale derived data and jobs after edits.
- Read export data by owner. Retain stable item, file and tag identifiers and their relationships. Export records and archive references also belong to that owner.
- Item deletion immediately removes access and search visibility. Account deletion blocks the owner, revokes sessions, invalidates outstanding work, and uses durable cleanup for originals, exports, derived data, jobs, metadata and application records. Remove Better Auth records through the supported lifecycle. Keep cleanup references until object removal is confirmed. Backup expiry, retention and any recovery window remain open.
