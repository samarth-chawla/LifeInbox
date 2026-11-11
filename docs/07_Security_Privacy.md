# LifeInbox — Security, Privacy & Data Protection Requirements

*LifeInbox • Project Documentation*

## 1. Identity and Data Isolation

- Centralize Better Auth session validation and resolution of the active LifeInbox owner for every protected Route Handler. Treat item IDs, object keys and client-supplied user IDs as untrusted input.
- Use secure cookies, trusted origins, supported password hashing, email verification, recovery and revocation. Keep secrets server-side and apply appropriate rate limits for sign-in, recovery and sensitive actions across deployed instances. Check recent authentication for account deletion.
- Scope all user-data queries, searches, processing jobs, file access and exports to that owner. Verify resource relationships before access or writes. Apply ownership before ranking and before issuing any file or export link.
- Use parameterized SQL, validate inputs and allow-list dynamic options such as sort fields. Test that guessed IDs and malformed or mismatched relationships cannot access another user's data.

## 2. Uploads, Downloads and Quotas

- Allow-list supported types and extensions. Enforce configurable size limits and verify actual size, MIME type and file signature before accepting an upload. Client declarations are preliminary.
- Generate storage keys independently of user-supplied filenames. Sanitize display and download filenames and prevent path traversal in files and export entries. Treat documents as untrusted, apply parser resource limits, and never execute uploaded content. Evaluate malware scanning where it can reduce risk.
- Keep originals and export archives in private S3-compatible storage. Persist keys server-side. Authorize each access before issuing a short-lived signed URL. Treat signed links as bearer credentials and keep them out of logs.
- Enforce configurable quotas and the seven-day-or-storage trial boundary per owner. End the trial at the earlier of the deadline and confirmed original bytes reaching the allowance. Reserve bytes atomically before permitting upload, recheck at finalization, and reconcile abandoned or failed uploads. Prevent races and replay, enforce restricted writes after trial end according to policy, and preserve existing data.

## 3. Safe URL Fetching

- Accept HTTP(S) URLs for extraction and validate the parsed scheme, host and port. Fetch in a restricted server-side job with no browser session cookies, internal credentials or ambient authentication.
- Deny loopback, private, link-local, reserved and other non-public addresses, internal hosts and cloud metadata endpoints. Check both IPv4 and IPv6 DNS answers and ensure connections use a validated destination. Guard against DNS rebinding and verify the original hostname for TLS.
- Bound redirects and validate every redirect target and its resolved destination before connecting. Block unsafe schemes and private or internal destinations at every hop. Use network egress restrictions as defense in depth.
- Enforce connection and overall time limits, response-size limits including decompressed bytes, and allowed response MIME types. Parse only supported content without executing scripts or fetching unvalidated embedded resources.
- Preserve the original URL and expose a safe processing status if extraction is blocked, fails or yields unsupported content. Saving and lexical search remain available.

## 4. External AI and Privacy

- External AI requires the user to enable it. Explain the providers, content and purposes involved before enabling it, including when item text, images, metadata or search queries may leave LifeInbox. Explain provider retention and use of data as part of the integration evaluation.
- Check current permission before sending data, including in queued jobs, retries and semantic queries. When external AI is disabled, send no user content to it. Users can still save items, set titles and tags manually and search by keyword.
- Keep provider API keys server-side. Send the minimum necessary data. Keep full prompts, source documents and generated output out of routine logs. Using user data for provider training would require explicit consent and compatible product and provider terms.
- Treat webpage and document text as untrusted input to optional enrichment. Keep application instructions separate, validate generated metadata and prohibit model output from driving privileged actions or cross-user access.
- PDF text extraction, OCR and URL extraction can run independently of external LLMs. Evaluate any external non-LLM processing service for privacy before sending private content to it.

## 5. Processing and Export Authorization

- Queue jobs with an authorized owner and resource reference. Workers recheck ownership and current state, use restricted credentials, apply execution limits and make retries safe. Record operational errors without including sensitive content.
- Authenticate export requests and scope every included record and file to the requesting owner. Exclude auth credentials and password hashes. Verify ownership, account state and archive state before issuing a short-lived private link. Expire and remove temporary archives and block new access after expiry.

## 6. Deletion and Retention

Item deletion removes it from access and search immediately and initiates cleanup. Account deletion is a LifeInbox-owned workflow. Verify recent authentication and ownership, mark the account as deleting, block requests and new jobs, and revoke Better Auth sessions. Cancel or invalidate stale work so it cannot recreate data. Use durable, retryable cleanup for private originals and export archives, extracted text, embeddings, metadata, jobs and application records. Delete Better Auth identity records through the supported lifecycle. Keep the owner and object references needed for cleanup until removal is confirmed, then retain only approved audit state. Release charged bytes only after the original object is gone.

Define retention for post-trial access, objects awaiting cleanup, affected export archives, backups and any recovery window before release. Trial expiry alone never triggers deletion. Stop issuing links for deleted originals. Existing signed links can remain usable until expiration or object removal, so keep their lifetime short.

## 7. Security Verification

Test broken object-level authorization, cross-user search and job execution, malicious uploads and filenames, signed-link expiry, export isolation, concurrent uploads, both trial end conditions, cleanup retries, attempts to regain access during account deletion, and account or session abuse. Exercise URL redirect, DNS and resource-limit protections. Verify that disabling external AI prevents outbound AI calls and that operational logs omit sensitive data.
