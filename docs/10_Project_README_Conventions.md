# LifeInbox — Project README & Development Conventions

*LifeInbox • Project Documentation*

## 1. Project Definition

LifeInbox is a personal information storage and retrieval platform. Its MVP supports manual capture of text notes, URLs, images/screenshots, and PDFs and supported documents. The core workflow is capture → store → process → index → search → retrieve.

## 2. Repository and Application Structure

This repository currently contains project documentation under `docs/`. The approved architecture is a single Next.js application using TypeScript, Tailwind CSS and Route Handlers. Use Route Handlers → services → repositories/data access where useful. Keep Better Auth, database, storage, processing and optional AI modules server-side. The PostgreSQL-backed job runner shares application logic. Its execution model and exact directory layout remain open.

Start with the [PRD](01_PRD_LifeInbox.md), [architecture](03_Architecture_Data_Flow.md), [security requirements](07_Security_Privacy.md) and [roadmap](08_Roadmap_MVP.md). The [complete documentation](LifeInbox_Complete_Documentation.md) mirrors the individual Markdown chapters. The [implementation plan](Implementation_Plan.md) records phase boundaries and acceptance criteria. The original DOCX files are historical copies.

## 3. Development Rules

- Validate input at API boundaries. Use direct parameterized SQL via `pg`. Use PostgreSQL and pgvector. Prisma is excluded.
- Centralize Better Auth session validation and resolve a stable LifeInbox owner before calling services. Jobs carry the same owner ID. Scope queries, search, jobs, files, exports and entitlements to that owner.
- Keep uploaded files private. Store object keys in PostgreSQL and authorize short-lived links. Treat quota reservation, finalization, retries and cleanup as one accounting lifecycle. Enforce the earlier of the seven-day trial deadline and the configurable storage limit. Preserve data and prompt for a future upgrade.
- Keep URL, PDF and OCR processing independent of external LLMs. Use modular optional AI providers, version prompts and models where practical, check user consent and keep credentials server-side.
- Prefer incremental features and explicit data access. Verify ownership, search relevance, safe ingestion, quota concurrency, export and deletion behavior.

## 4. Configuration Examples

- PostgreSQL connection, such as `DATABASE_URL`.
- Better Auth server-side settings, PostgreSQL persistence, secrets, trusted origins, verification and recovery mail.
- Private S3-compatible storage endpoint, region, bucket and server-side credentials. Cloudflare R2 is the preferred candidate.
- Configurable trial duration (seven days), per-user byte allowance, future prices, supported formats and size limits, job retries, link expiry and retention.
- Optional AI provider credentials and model configuration, such as `LLM_API_KEY` and `EMBEDDING_MODEL`. The core workflow must run without AI credentials.

## 5. MVP Development Order

Start with the local application foundation. Then establish Better Auth, the stable owner boundary, SQL data access, and trial eligibility before user writes. Add capture, safe processing and quota enforcement, then keyword and metadata retrieval followed by MVP semantic retrieval. Finish downloads, exports, secure account deletion and pilot verification. Follow the [implementation plan](Implementation_Plan.md) and [MVP roadmap](08_Roadmap_MVP.md).

## 6. Scope

The MVP includes semantic retrieval using pgvector and optional user-controlled AI metadata. It excludes browser extensions, mobile apps, email forwarding, third-party product integrations, reminders, AI chat, RAG-generated answers, Redis, BullMQ, a separate vector database, complex microservices and payment integration. Hybrid search is Stage 3. Paid storage purchases are future work.
