# LifeInbox — API Specification

*LifeInbox • Project Documentation*

## 1. Conventions

The application API uses Next.js Route Handlers under `/api/v1`. The routes below are proposed contracts. JSON requests use validated input, and failures use stable error codes, messages and optional field details. Verify Better Auth sessions through the centralized request boundary and resolve the stable LifeInbox owner before calling a service. Check owner and account state before each resource operation. Gate new writes and uploads on the applicable trial or paid entitlement. A client-supplied user ID is never authorization.

## 2. Authentication and Account Settings

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/me` | Return profile, external AI settings, confirmed and reserved bytes, applicable allowance, trial deadline, status, end reason and future upgrade eligibility. |
| PATCH | `/api/v1/me/settings` | Update user-controlled settings, including external AI permission where AI is available. |

Better Auth serves sign-up, sign-in, email verification, recovery, sign-out and session operations through its Next.js handler. Application routes use its verified session to resolve a LifeInbox owner. Use current Better Auth documentation when implementing the provider routes.

## 3. Items

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/items` | Manually create an item. Persist an original URL before scheduling safe non-LLM extraction. |
| GET | `/api/v1/items` | List and filter the owner's items. |
| GET | `/api/v1/items/:id` | Read the owned item and processing status. |
| PATCH | `/api/v1/items/:id` | Update allowed content, titles, tags and other editable metadata. Reindex affected fields. |
| DELETE | `/api/v1/items/:id` | Remove access and initiate cleanup of originals and derived data. |

Phase 4 implements text notes. Create with `{ "kind": "note", "title": "...", "noteText": "...", "tags": ["..."] }`. PATCH accepts any subset of `title`, `noteText`, and `tags`. An empty tag array removes all tag assignments. Create and edit return `{ item }` with the saved note and tags. A successful delete returns 204.

The list returns `{ items, page, hasMore }` with 20 note summaries per page, ordered newest first. Use the optional one-based `page` query parameter. Detail returns `{ item }`. A note from another owner or a different item kind is unavailable through the notes API. An ended trial returns `403 TRIAL_ENDED` on create and edit. Read and delete access remains available.

Titles allow up to 200 characters, note text up to 50,000, and each note up to 20 tags of 50 characters each. Tag names are trimmed, case-sensitive, and may not contain commas, which the notes form uses as separators.

Phase 5 adds URL items. Create with `{ "kind": "url", "originalUrl": "https://example.org/article", "title": "Optional title" }`. Creation returns 201 with the saved URL and queued status. Use `GET /api/v1/items?kind=url` for a paginated list of saved links. Detail includes the original URL, status, a safe error code, retry availability, and extracted text and metadata when available. GET and DELETE on an item ID accept an optional `kind` filter. PATCH applies to notes.

`POST /api/v1/items/:id/retry` returns 202 for an eligible owner-scoped retry and 409 when the current job cannot be retried. Concurrent requests can queue the same failed job only once. Failed extraction leaves the original URL available.

## 4. Files

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/uploads/presign` | Validate the owned target item, file metadata and capacity. Check trial entitlement, reserve bytes atomically and return time-limited upload instructions. A controlled upload path can be used when direct-upload restrictions cannot be enforced. |
| POST | `/api/v1/items/:id/files/complete` | Verify reservation ownership, current entitlement and actual object size, MIME type and signature. Finalize once, charge actual bytes, record trial end if the limit is reached, and enqueue processing. |
| GET | `/api/v1/items/:id/files` | List authorized file metadata. |
| GET | `/api/v1/files/:id/download` | Recheck ownership and availability, then issue a short-lived signed download or redirect. |

Distinguish an upload that would exceed remaining capacity from a trial that has ended. Return a stable reason and account-specific limit information. A seven-day deadline or confirmed original bytes reaching the configurable allowance ends the trial, whichever comes first. Show an upgrade prompt while preserving data. Checkout is outside MVP. Download responses use safe filenames and keep underlying objects private. See the [quota accounting rules](04_Database_Schema.md#3-storage-quota-accounting).

## 5. Search

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/search` | Stage 1 keyword and metadata search over the owner's items with type, tag and date filters as supported. |
| POST | `/api/v1/search/semantic` | Proposed Stage 2 MVP endpoint. Validate embedding permission and search owner-scoped pgvector candidates with supported filters. |

Return item ID, title, content type, snippet, relevant metadata, and relevance or match information where useful. Users can open the underlying item or source. Hybrid ranking follows as Stage 3 after evaluating both retrieval modes. The MVP has no chatbot or answer-generation endpoint.

## 6. Data Export

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/exports` | Request a complete LifeInbox data export. Queue large exports using PostgreSQL jobs. |
| GET | `/api/v1/exports/:id` | Return the owner's export state, availability and expiry. |
| GET | `/api/v1/exports/:id/download` | Recheck ownership, readiness and expiry, then issue a short-lived private download link. |

The export includes saved item content and metadata, original files, tags and assignments, and user-facing settings. Preserve item-to-file and tag relationships using stable IDs and manifest paths. One possible layout uses `metadata/items.json`, `tags.json`, `user-settings.json`, `notes/`, `images/`, `documents/` and `README.txt`. Exclude auth credentials, password hashes, session tokens, secrets and signed URLs. The precise archive schema, consistency rules for concurrent edits and retention window remain open.

## 7. Account Deletion

A proposed `DELETE /api/v1/me` verifies recent authentication, resolves the owner, blocks access, revokes sessions and durably initiates retryable cleanup. Repeated requests or job attempts must be safe. Coordinate Better Auth identity deletion with removal of application data, private originals, embeddings, jobs and export archives. Preserve only the cleanup state and minimal references needed for completion and the approved retention policy.
