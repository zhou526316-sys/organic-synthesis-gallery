# PDF Vault P0 implementation contract

Status: implemented foundation; no ordinary-user PDF service or UI is enabled by this batch.

This implements the first data and presentation contracts of [China-first PDF Vault v1](../architecture/PDF-VAULT-CHINA-V1.md). It does not complete P1 local storage or P2 publisher capture. The existing owner-only PDF button and `private_pdf_*` subsystem remain separate.

## Runtime and deployment boundary

The new JavaScript modules are not imported by the production page or Worker. The new SQL migration is not wired into a production deployment workflow. The complete schema includes the new definitions for fresh databases, and the isolated migration is ready for installation when the first actual Vault service is introduced.

The dedicated P0 workflow has read-only repository permission, no deployment credentials and no production mutation step. A successful P0 run proves the executable contracts and SQLite constraints; it does not prove that new tables were installed in production or that ordinary users can save/open PDFs.

No owner-read grant, cross-user private-PDF reuse, hidden contribution, cloud upload or ordinary-user V3 write rollout is added here.

## Files

| File | Responsibility |
| --- | --- |
| `shared/pdf-vault-v1.mjs` | Manifest allowlists, identity checks, seven card states and capture eligibility |
| `shared/pdf-vault-device.mjs` | Lazy, random browser-installation identity with explicit persistence status |
| `cloudflare/pdf-vault-v1.sql` | Idempotent, independent control-plane schema |
| `cloudflare/pdf-vault-session-consume.sql` | A parameterized, single-use session claim |
| `cloudflare/schema.sql` | Matching definitions for fresh databases |
| `scripts/test-pdf-vault-v1.mjs` | Account/copy/state and session-contract behavior |
| `scripts/test-pdf-vault-device.mjs` | Identity persistence and storage/crypto failure behavior |
| `scripts/test-pdf-vault-schema.py` | Real SQLite constraints, migration compatibility and claim replay checks |
| `.github/workflows/pdf-vault-p0.yml` | Small CI gate and exact-source evidence |

## Account and file identities

All document identity is `(user_id, doi)`. DOI normalization reuses `shared/literature-identity.mjs`; it does not rewrite legacy public literature records.

- `user_documents` stores an account's document preference. An absent preferred version/hash is represented by both fields being null.
- `user_document_copies` uses `(user_id, doi, id)` and a composite foreign key to the document. A copy's owner, document, location identity and version cannot be reassigned. Imported bytes must have their own copy identity when content changes.
- `pdf_capture_sessions` binds an account/document to one publisher, local destination and device. It is not a replacement for the operator's existing capture lease.

Hash equality is only a content comparison. There is no global content-hash entitlement table and no link to `private_pdf_documents`. The same DOI/hash in two accounts never authorizes either account to read the other's copy.

Version kinds are `publisher`, `accepted_manuscript`, `preprint` and `unknown`. Copy states are `pending`, `available`, `missing`, `revoked` and `deleted`. Deleted and revoked copies are terminal records; restoring them requires a new copy ID. A row marked available must include hash, byte length, acquisition time and verification time. That describes a retained copy's metadata; it is not evidence that the current browser can open it.

## Metadata boundary

`toDocumentManifest` and `toCopyManifest` return explicit allowlisted objects. Extra properties are not copied. No local path, FileSystemHandle, PDF bytes, full text, cookie, credential, signed URL or arbitrary nested object belongs in a synchronized manifest.

For `local_folder` and `opfs`, the server-side shape contains an opaque device ID, copy ID and content metadata. Provider fields must be null. The real path and directory/file handles remain in device-local storage in P1.

For future `personal_cloud`, `gallery_cloud` and `public_oa` records, `provider_ref` means an opaque application-owned reference. It must not be a raw provider URL, signed read link or access token. Syntax checks cannot identify every secret-shaped string: the future adapter must construct this field from its own safe mapping, not forward untrusted provider responses.

The future API must authenticate the caller and inject/validate its account scope. A manifest serializer is neither an authorization endpoint nor a sanitizer for arbitrary credentials disguised as identifiers.

## Device identity

`getPdfVaultDeviceIdentity()` lazily returns a frozen `{ device_id, persistence }` object. The first call may use localStorage; importing the module has no storage side effect.

- `persistent`: a valid stored ID was read or a new secure random ID was written and read back.
- `session`: a secure random ID exists only for this resolver's page/runtime lifetime.
- `unavailable`: secure identity generation was unavailable and no valid stored ID could be recovered.

Storage exceptions, quota failure, denied reads and failed readback are handled without inventing durable persistence. There is no clock, user-agent, account-name, path or Math.random fallback. The ID identifies a browser installation, not a physical computer and not a right to read a file. Clearing browser data can remove it.

P1 must handle account changes, unavailable storage and removed permissions, and must not claim durable local retention solely because an in-memory identity exists.

## Card states and actions

`resolvePdfCardState(input)` returns `state`, `label`, `action`, `reason` and an optional `copy_id`. It returns no file URL, token, nonce, content hash or local path.

| Label | Required evidence |
| --- | --- |
| PDF | No usable retained copy has been established |
| PDF · 本机 | A matching current-device copy and fresh actual file-readability probe |
| PDF · 云端 | A matching account-owned cloud copy and fresh provider-readability probe |
| PDF · 另一设备 | This account knows an available local copy on a different device |
| PDF · OA | Independent OA rights verification plus current readability of that exact copy |
| PDF · 需权限 | Publisher access is required and there is no higher-priority readable copy |
| PDF · 获取中 | An eligible active acquisition exists and no already-readable copy takes priority |

Selection order is current-device local copy, personal cloud, optional Gallery cloud, independently verified OA, active capture, another device, local verification/restore, and publisher acquisition. Reserved cloud states do not enable cloud integrations.

A readability probe is bound to `user_id`, normalized DOI, `copy_id`, `content_hash` and the current `device_id`. It must not be future-dated or older than 60 seconds. Synchronized `available` or `last_verified_at` fields cannot replace this probe. The newest probe supersedes older results; simultaneous conflicts do not select a readable result. Contradictory raw copy identities, including incomplete tombstones, are rejected. The caller must discard old snapshots on account/device change.

A local manifest without a current probe yields a verify/restore action, not “本机可读.” Mobile/WeChat permission-required items may yield the future desktop-queue action. This is an action contract only; P0 does not create a real queue.

OA proof is supplied separately through trusted `oa_verifications`, bound to the account/document/copy/hash and with a valid verification lifetime. The newest OA verification supersedes older facts, and a simultaneous denial takes precedence. A user's `oa_verified: true` property in a copy is ignored. The module does not independently determine copyright status.

Even a fresh successful probe is a presentation hint. The eventual open operation must recheck file/provider access and handle permission loss, deletion or a changed account.

## Normal-user capture session contract

Timestamps are safe-integer Unix milliseconds. Capture lifetime is 600,000–900,000 ms. This batch permits only `local_folder` or `opfs` destinations.

A session includes account, DOI, publisher, destination, device, an opaque ID, nonce hash, maximum byte length, creation/expiry times, and nullable used/revoked times. The actual high-entropy nonce remains outside synchronized manifests; a future endpoint must hash the presented nonce and compare the stored value.

`validateCaptureSession` only checks shape, binding, size when provided, time and used/revoked state. Conflicting raw records for the same account/session ID cannot display an active acquisition. It does not authenticate the caller, prove publisher access, validate a PDF, establish hosting/sharing permission, check a nonce preimage or consume the session.

The prepared SQL file claims at most one matching, unused, unrevoked, unexpired session using trusted server time and validated received size. Success requires exactly one affected row. A zero-row claim must never be interpreted as a successful import.

P2 must coordinate the claim and manifest write so that a failed claim cannot leave a successful import record. Merely placing an UPDATE and INSERT in a D1 batch is insufficient: an UPDATE affecting zero rows does not itself fail the batch. Every subsequent mutation must be guarded by the unique successful claim, or use a transaction mechanism that checks the result and rolls back. This batch provides no such production import endpoint.

## Verification

Run the focused gates from the repository root:

```sh
node --test --test-reporter=tap scripts/test-pdf-vault-v1.mjs scripts/test-pdf-vault-device.mjs
python3 scripts/test-pdf-vault-schema.py -v
```

The SQLite tests enable foreign-key enforcement, apply the isolated migration repeatedly, compare the fresh-schema and migrated shapes, execute the reusable claim SQL, and verify that owner-private tables/data remain unchanged.

The CI artifact contains bounded logs, a small summary, the exact checked-out source commit and source blob hashes. It explicitly records `productionMutations: false`, `publicPdfUiEnabled: false` and `crossUserReadGrantsEnabled: false`.

## Next integration boundary

P1 must provide a real directory picker and local manifest, OPFS fallback, actual hash/PDF validation, a reader, account/session handling and the desktop-acquisition queue. It must pass actual-browser tests before becoming visible to ordinary users.

Install the P0 migration only as part of a separately verified service integration. That integration must add authenticated, account-scoped endpoints and lifecycle/concurrency controls rather than exposing these tables directly.

Owner automatic capture verification/activation is a separate existing-subsystem task. The owner button's presence does not mean every raw captured PDF is already readable.

## Primary implementation references

- [Cloudflare D1 foreign-key enforcement](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [Web Crypto randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
