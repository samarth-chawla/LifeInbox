# LifeInbox — Search & Retrieval Specification

*LifeInbox • Project Documentation*

## 1. Stage 1 — Keyword and Metadata Retrieval

Search returns saved items and their sources. Support keyword search over available note and extracted text, metadata search over titles, tags and other searchable fields, and filters such as type, tag and date. Return useful snippets and let users open the saved item, original URL or authorized file download.

Search and saving must work with external AI disabled. A saved URL is indexed from its original URL, manual metadata and any useful content extracted without an LLM. File text extraction and OCR are separate from external AI processing.

## 2. Indexing and Ownership

1. Persist the saved item's available text and metadata.
2. Extract text from supported sources, normalize whitespace and retain useful source metadata. Preserve user-entered titles and tags when adding suggestions.
3. Index available searchable fields in PostgreSQL and update them when the item changes.
4. Filter the candidate set to the authenticated owner and requested filters before ranking or returning results. Recheck authorization when the source is opened.

If enrichment is skipped or extraction fails, the original remains available and existing indexed fields can still be retrieved.

## 3. Stage 2 — MVP Semantic Retrieval

- Use embeddings and PostgreSQL pgvector to find related material even when exact terms differ. Keep generation behind a provider interface. Verify current user permission before embedding user content or a query with an external provider, including retries. The MVP uses no separate vector database.
- Use deterministic chunks with overlap only where useful. Record source revision, model, provider, version and dimensions. Index vectors only for the owner's content, skip re-embedding unchanged text and use asynchronous indexing.
- Keep query and indexed vectors compatible by model/version and dimension. Select the distance metric with the model. Start with exact owner-filtered similarity as a baseline. Evaluate HNSW and recall under realistic owner and metadata filters before adding an approximate index. Plan reindexing when changing model or dimensions. [pgvector indexing and filtering](https://github.com/pgvector/pgvector#indexing)
- Deliver semantic retrieval for eligible users before MVP acceptance. Keep the Stage 1 search path available when embeddings are disabled, unavailable or still processing.

## 4. Stage 3 — Hybrid Search

Evaluate hybrid retrieval as a follow-on after both MVP layers are available. Combine owner-scoped lexical and vector candidates. Candidate approaches include weighted scores and reciprocal-rank fusion. Tune against a relevance set and measure the additional cost and latency before making a choice.

## 5. Queries and Evaluation

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
