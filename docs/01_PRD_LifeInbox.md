# LifeInbox — Product Requirements Document

*LifeInbox • Project Documentation*

## 1. Product Overview

LifeInbox is a personal information storage and retrieval platform. Its promise is “Save anything. Find it later without remembering its filename, folder, or source.” The MVP supports manual capture of text notes, URLs, images and screenshots, and PDFs and supported documents. Search returns the saved items and their original sources.

## 2. Problem and Goal

Useful information is scattered across browser bookmarks, screenshots, chat messages, downloads, notes and cloud folders. Users often remember the meaning or context of something they saved but forget its exact title or location. Make saving information effortless and make retrieving it faster than remembering where it was stored.

## 3. Target Users

- Students who save study material, links, screenshots, PDFs and project references.
- Developers who save documentation, debugging notes, code references and technical articles.
- Working professionals who save documents, meeting notes, research and useful links.
- General users who repeatedly save screenshots, recommendations, receipts and information for later.

## 4. Core User Stories

- I can manually save a note, URL, image, screenshot, PDF or supported document.
- I can provide and edit titles, tags, descriptions and other user-editable metadata.
- I can find my items by keywords, metadata and filters, then open the original source or download its uploaded file.
- I can see when background processing failed and still access the original item.
- I can see my trial deadline and storage usage, understand why my trial ended, and see the future paid upgrade path.
- I can export my LifeInbox data with the relationships between items, metadata and uploaded files intact.
- I can securely delete my account and its associated LifeInbox data.

## 5. MVP Scope

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

## 6. Out of MVP

- Browser extension, mobile app and share sheet, email forwarding, automatic inbox ingestion and third-party integrations such as calendars.
- Shared or collaborative workspaces, family accounts and complex agentic workflows.
- Reminders, AI chatbot and RAG-generated answers.
- Redis, BullMQ, payment gateway implementation and complex microservices.
- A separate vector database.

## 7. Core Workflow

1. **Capture.** The user manually submits a note, URL or file.
2. **Store.** Persist the item and its source metadata. Keep original uploaded bytes in private object storage.
3. **Process.** Extract text and metadata from supported sources, including URL extraction, PDF extraction and OCR as appropriate. Run external AI enrichment only with the user's permission.
4. **Index.** Make title, tags and available content searchable. Generate and index pgvector embeddings when permitted.
5. **Search.** Match and filter the authenticated user's saved items.
6. **Retrieve.** Open the saved item or original URL, or download the uploaded file.

## 8. Trial and Paid Storage

The free trial ends when seven days elapse or confirmed original upload usage reaches the applicable free allowance, whichever comes first. The duration and allowance are configurable, with seven days as the approved trial duration. Pending reservations reduce upload headroom. A rejected upload by itself does not end the trial. Ending a trial must never silently delete data or restart a trial after space is freed.

Prompt users to upgrade when the trial ends. The proposed safe default restricts new creation and uploads while retaining access to existing data, including export and deletion, under the final access and retention policy. The trial start trigger, exact post-trial access and retention, free byte allowance, and paid prices remain open. Future plans can raise an owner's storage entitlement. MVP excludes checkout and payment processing.

## 9. Non-Functional Requirements

- Keep user data isolated and treat uploads and extracted text as private.
- Measure search latency after a baseline is available. Common searches should feel interactive.
- Make processing failures visible and recoverable while preserving the original item. Track job failures without logging sensitive content.
- Keep database records and binary storage separate. Run expensive processing outside the request lifecycle.

## 10. Success Metrics and Risks

- Track activation by whether new users save at least three items, search-to-open rate, human-rated retrieval relevance, processing success, and return visits at seven and thirty days.
- Validate whether users trust LifeInbox with personal data and return for repeated retrieval. Saving habits, weak relevance, extraction errors, and storage or AI costs can undermine adoption.
- Track conversion to paid storage once pricing and a purchase flow have been validated and launched.
