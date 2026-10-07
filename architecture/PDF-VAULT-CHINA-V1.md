# China-first PDF Vault architecture v1

Date: 2026-10-06
Status: architecture decision; no production behavior changed

## Implementation boundary — 2026-10-07

This document is the accepted product/storage direction. Its P0–P5 milestones are not completed by the public-site scale work or the D3c personal-library migration.

The D3c row model supplies part of the user control layer: favorites, reading state, notes and paper metadata. Ordinary-user V3 writes remain disabled while migration correctness and recovery are hardened. This is a prerequisite, not the PDF document/copy model, a local PDF vault, or a completed P0/P1 implementation.

The next PDF implementation batch starts with P0 data identities, authorization boundaries and the copy-aware state machine, then P1 local folder/OPFS storage, reader and desktop-acquisition queue. Existing owner-private PDF storage remains a separate system throughout. Provider integrations, general user cloud storage and knowledge/model access remain later milestones.

Progress must distinguish a committed design, implemented code, verified deployment and user rollout. A card's retained PDF status records the account's known copy locations; it does not assert that Gallery stores the PDF bytes.

## Decision

Gallery PDF retention is local-first and user-owned. Public literature metadata remains shared, while paywalled PDF bytes and derived full text remain user-scoped.

The preferred storage order for Mainland China users is:

1. User-visible local folder on desktop when the browser supports directory access.
2. OPFS as a browser-local fallback/cache.
3. User-controlled sync/cloud provider as an optional cross-device copy.
4. Gallery-operated object storage only as an explicit optional backup product, never the default destination for all users.

Google Drive is not a priority integration for Mainland China. Global OneDrive is not a default dependency. China-operated Microsoft 365/OneDrive may be supported later through its separate national-cloud endpoints. Domestic providers and provider-neutral local sync are prioritized.

## Device roles

### Windows desktop / Edge / Chrome

This is the primary acquisition and long-term-library environment.

The user selects a real library directory, for example:

Organic Synthesis Gallery/
  PDFs/
  Metadata/
  Exports/

The site stores directory handles only in local browser storage. Server-side state records only an abstract device/copy presence and never the user's local filesystem path.

If directory access is unavailable, use OPFS. OPFS is a fallback/cache, not the only durable copy.

### Mobile browsers

Mobile is optimized for discovery, reading status, summaries, notes and opening already-available copies.

A paywalled PDF that is not already available should normally become a "待电脑获取" task rather than forcing an institutional-auth/download workflow inside a mobile WebView.

### WeChat in-app browser

Treat WeChat as a discovery/share entry, not the primary PDF acquisition environment.

For a paywalled item:
- show the PDF state;
- allow "加入待电脑获取";
- allow opening in the system browser when possible;
- do not attempt to proxy school/VPN credentials through Gallery.

## PDF button state machine

Card states:

- PDF — no retained copy known.
- PDF · 本机 — this device has a usable local copy.
- PDF · 云端 — the user has a usable personal-cloud copy.
- PDF · 另一设备 — a copy exists for this account, but not on this device and no directly readable cloud copy is available.
- PDF · OA — a verified public/open copy is available.
- PDF · 需权限 — publisher/institution access is required.
- PDF · 获取中 — a user-initiated acquisition session is active.

Click priority:

1. Open current-device local copy.
2. Open personal-cloud copy.
3. Open verified OA copy.
4. If only another-device presence exists, offer restore/reacquire.
5. Otherwise start publisher acquisition.

## Publisher acquisition

Gallery never stores school credentials, VPN credentials or publisher cookies.

For paywalled content, access is decided by the user's own browser/network/institution session.

A normal user acquisition uses a one-time capture session bound to:

- user_id
- doi
- publisher
- destination
- max_bytes
- created_at
- expires_at
- used_at
- nonce

Recommended expiry: 10-15 minutes. A session is consumed after one validated PDF import.

The existing long-lived owner/Tampermonkey capture lease remains separate for operator automation and must not be reused as the normal-user authorization model.

## Storage model

Logical document and physical copies are separated.

Suggested new tables:

### user_documents

- user_id
- doi
- preferred_content_hash
- preferred_version_kind
- created_at
- updated_at

Primary key: (user_id, doi)

### user_document_copies

- id
- user_id
- doi
- content_hash
- storage_kind: local_folder | opfs | personal_cloud | gallery_cloud | public_oa
- device_id nullable
- provider nullable
- provider_ref nullable
- byte_length
- version_kind
- state
- acquired_at
- last_verified_at
- created_at
- updated_at

A local path or FileSystemHandle is never synced to the server. It stays in device-local IndexedDB/OPFS metadata. The server only knows that device X has content hash Y.

### pdf_capture_sessions

- id
- user_id
- doi
- publisher
- destination
- nonce_hash
- max_bytes
- created_at
- expires_at
- used_at

### user_document_derivatives

- user_id
- doi
- content_hash
- derivative_kind: page_text | fulltext_index | annotation_index | embedding
- storage_scope: device | personal_cloud | gallery_cloud
- version
- state
- updated_at

## Existing private PDF subsystem

Do not convert the current private_pdf_documents table into a multi-user shared entitlement table.

Keep the current owner/private subsystem isolated.

If Gallery cloud backup is added later, create a user-scoped asset/binding path. Authorization must be checked by user_id + copy ownership, not merely by DOI or a broad private_pdf_read capability.

For non-open PDFs:
- deduplicate within the same user when practical;
- never infer user B's right to read from user A's stored copy;
- do not expose a global DOI-to-private-PDF lookup.

Cross-user public deduplication is allowed only for material whose public/open status has been independently verified.

## Mainland China cloud strategy

Phase 1 requires no cloud-drive API. A user can choose a local folder that is already synchronized by software they trust. This is the lowest-friction, provider-neutral option.

Phase 2 connectors should prioritize providers usable in Mainland China.

Candidate order:
1. Baidu Netdisk OAuth/API, after application approval and API capability validation.
2. Nutstore/WebDAV through a local helper or secure connector; do not store a raw WebDAV app password in Gallery frontend state.
3. China-operated Microsoft 365/OneDrive for institutional users through the China national-cloud endpoints.
4. Other domestic providers only after their developer authorization and API lifecycle are proven stable.

Google Drive is optional for overseas users, not a China-default dependency.

## Gallery-operated cloud backup

This is optional and quota-controlled.

Mainland production should use a China-appropriate object-storage deployment only after hosting/ICP/compliance work is complete. The existing Cloudflare R2 private bucket remains suitable for the operator/private workflow and overseas fallback, but should not become the default storage location for all Mainland China user PDFs.

Recommended product policy:
- free: metadata sync + local PDFs;
- optional paid/storage quota: private cloud backup;
- never silently upload a retained PDF to Gallery cloud.

## Knowledge-base layer

After a user retains a PDF:

1. Validate PDF magic, DOI association where possible, size and SHA-256.
2. Extract page text locally with PDF.js/Web Worker.
3. Build page -> text offsets and local full-text index.
4. Save annotations, collections and reading state separately from PDF bytes.
5. Keep derived full text under the same access scope as the source PDF.

For paywalled PDFs, extracted full text is local by default. It is not converted into a public/shared corpus.

## Model integration

Expose a storage-neutral document interface:

- search_library
- get_paper
- get_paper_text
- get_page_text
- list_collections
- get_notes

Two future modes:

1. Desktop/local MCP bridge: reads the user's selected local library folder; ideal for local models and desktop AI clients without uploading the entire library.
2. Account Knowledge API: available only for documents the user has explicitly made cloud-readable; tokens are read-only, scoped by collection/document, expiring and revocable.

Model integrations never receive school VPN credentials, publisher cookies or cloud-provider passwords.

## China-first UX rule

Discovery can happen anywhere. Acquisition should happen where institutional access is strongest.

Therefore:
- mobile/WeChat can queue "待电脑获取";
- desktop can process the queue after the user is on campus/VPN;
- successful acquisition synchronizes only the manifest/state unless the user explicitly chooses a cloud destination.

## Scale rule

D1 stores control-plane metadata only. PDF bytes and large extracted-text indexes are excluded from the primary shared D1 database.

As user volume grows, user-library metadata is shardable by user/tenant. Do not wait for the primary D1 database to approach its per-database ceiling before introducing shard routing.

## Implementation phases

### P0 — schema and UI contract
- Add PDF button state machine.
- Define user_documents / user_document_copies / capture-session schema.
- Add device identity.
- Preserve current owner private-PDF behavior unchanged.

### P1 — desktop local vault
- Directory picker on supported desktop browsers.
- OPFS fallback.
- PDF.js in-site viewer.
- SHA-256 and local manifest.
- "待电脑获取" queue synced through account state.

### P2 — user-scoped publisher capture
- 10-15 minute one-time DOI-bound capture sessions.
- Tampermonkey receives only the capture session, never account credentials.
- User chooses "只看 / 保存本机 / 保存到个人云端".

### P3 — Mainland cross-device storage
- provider-neutral synced local folder first;
- Baidu Netdisk connector evaluation;
- Nutstore/local WebDAV bridge evaluation;
- China Microsoft 365 connector for institutional tenants.

### P4 — optional Gallery cloud backup
- quota/billing/retention rules;
- Mainland storage deployment only after compliance/ICP path is defined;
- per-user authorization and encryption controls.

### P5 — knowledge interface
- local full-text search;
- page-aware text extraction;
- desktop MCP bridge;
- cloud Knowledge API for explicitly cloud-readable user content.

## Non-negotiable rules

1. No school/VPN/publisher credentials stored by Gallery.
2. A user's paywalled PDF never becomes another user's entitlement.
3. Local paths/handles never sync to D1.
4. OPFS is fallback/cache, not the only durable source.
5. WeChat/mobile are not forced into paywalled capture workflows.
6. PDF bytes never enter D1.
7. Paywalled derived full text inherits the same user-private scope.
8. All cloud upload is explicit opt-in.
