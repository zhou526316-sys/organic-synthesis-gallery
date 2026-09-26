# Organic Synthesis Gallery — Daily Scheduled Summary Contract

Status: normative production contract.

## 1. Publication cadence

Reviewed literature summaries are generated and published once per day at **12:00 Asia/Shanghai**.

This 12:00 update is a **derived-summary publication only**. It must not add, remove, reclassify, or otherwise modify production literature cards, the authoritative literature datasets, TOC demand, or the 08:00 / 18:00 literature release state. The fixed literature-card slots remain unchanged.

The production Worker does not call a language-model API. Tampermonkey and the Worker only capture, normalize, hash, encrypt, store, and serve evidence/status data.

## 2. Private evidence handoff

Article Evidence Packet v2 remains private in R2.

For the scheduled review task, each eligible Evidence Packet is copied into a hybrid-encrypted handoff envelope:

- Evidence JSON is gzip-compressed before encryption;
- content cipher: AES-256-GCM;
- key wrapping: RSA-OAEP with SHA-256;
- public-key identifier: `9c55e2d2ed734de9`;
- plaintext Article Evidence Packet is never returned by the public handoff route;
- `textProcessingPolicy=no_external_ai` is excluded from the handoff.

The public handoff route is:

`GET /api/article-summary/scheduled-handoff?manifest=1&limit=N`

The manifest exposes only DOI, hashes, coverage, timestamps and encrypted-payload sizing metadata. It does not return ciphertext.

A scheduled reviewer then retrieves one bounded ciphertext slice at a time with:

`GET /api/article-summary/scheduled-handoff?doi=<DOI>&part=<N>&partSize=6000`

Each slice response may expose the wrapped AES key, IV, algorithm metadata and one ciphertext fragment. Reassembling all fragments is required before decryption. No route may expose captured publisher text in plaintext.

If a stored envelope was produced by an older key or transport format, the Worker must regenerate it from the private current Evidence Packet before serving it. Deployment backfill applies the same rotation rule.

A handoff-key rotation is operationally complete only after all three are true: the Worker public key/keyId is deployed, the 12:00 scheduled task holds the matching private key and transport contract, and the live manifest reports the same keyId/algorithm. Until then the daily reviewer must fail closed rather than fall back to a retired key or transport.

## 3. Daily review task

At 12:00 Asia/Shanghai the scheduled ChatGPT task:

1. retrieves pending encrypted handoff items;
2. decrypts them locally using the private key held only by the scheduled task;
3. reviews the Evidence Packet without using any OpenAI API key from the Gallery infrastructure;
4. produces Chinese and English summaries with the same scientific facts;
5. performs a second evidence audit before publication;
6. updates `public/scheduled-article-summaries.json` atomically on `main`.

The task should process all pending items that can be completed reliably in the run. If the backlog is unusually large, newest Evidence takes priority and remaining items stay pending for the next run.

Backlog ordering is explicitly newest-first: rank by Evidence `capturedAt` descending. A newer item that is fully reviewable must not wait for older pending items. The reviewer may publish a rigorously reviewed newest subset immediately while older items remain pending; FIFO clearing of historical backlog is not required.

### Bulk catch-up execution

A user-triggered catch-up is a **single bulk review operation**, not one DOI per run.

- Before decrypting work, skip DOI records that already have an approved scheduled summary whose `sourceHash` and `evidencePacketHash` still match current Evidence.
- Process remaining Evidence newest-first in micro-batches of **8–12 DOI**. A batch may contain `complete`, `partial`, and `abstract_only` items; each item keeps its own evidence restrictions.
- Do not deploy after every DOI. Complete two-pass review for the micro-batch, merge all approved records from that batch into `public/scheduled-article-summaries.json` atomically, then deploy once for the batch.
- One failed or deferred DOI must not stop the rest of its batch.
- After a successful batch deployment, continue immediately with the next newest micro-batch while execution budget remains. Re-read the current summary file and live manifest before each subsequent batch so concurrent changes are respected.
- The intended user experience is one trigger for the whole backlog. Internal batching exists only to bound context, tool calls, and failure blast radius; it must not require a separate user command for each article.
- Do not reduce evidence or bilingual-audit standards to increase throughput.

## 4. Evidence restrictions

Coverage levels remain:

- `abstract_only`: only abstract/frontmatter claims may be summarized;
- `partial`: use captured article text but disclose missing coverage;
- `complete`: full-paper summary may be produced, still subject to evidence checks.

Never fabricate missing conditions, yields, selectivities, scope, substrate failures, or mechanistic evidence.

Mechanistic content must distinguish:

- experimental evidence;
- mechanism proposed by the authors;
- model inference.

Model-only mechanistic inference must not be published as fact.

## 5. Required summary content

When supported by Evidence, the reviewed summary should cover:

- core transformation / synthetic strategy;
- key reaction conditions;
- substrate scope and selectivity;
- mechanistic experiments;
- author-proposed mechanism;
- limitations;
- concrete synthetic significance.

For `abstract_only` evidence, the summary must visibly state that it is Abstract-based and must not reconstruct missing details from general chemistry knowledge.

## 6. Publication record

`public/scheduled-article-summaries.json` uses:

- `version: 1`;
- `schemaVersion: scheduled-reviewed-summary-v1`;
- DOI-keyed `items`.

Each approved item must contain:

- `schemaVersion`;
- `doi`;
- `status: approved`;
- `sourceHash`;
- `evidencePacketHash`;
- `evidenceLevel`;
- `zh`;
- `en`;
- `generatedAt`;
- `reviewedAt`;
- `promptVersion`;
- `auditVersion`.

The Worker displays a scheduled summary only when both `sourceHash` and `evidencePacketHash` still match the current Evidence Packet. A later Evidence change automatically makes the old static summary ineligible.

## 7. Fail-closed rules

Do not publish a summary when:

- the encrypted packet cannot be decrypted or authenticated;
- the current Evidence hashes differ from the handoff;
- a major factual or numerical claim cannot be supported by captured Evidence;
- the article is marked `no_external_ai`;
- the bilingual versions materially disagree;
- the output is incomplete or malformed.

A failed item remains pending; failure of one DOI must not block the rest of the daily batch.

## 8. Frontend behavior

Before the daily batch is published, the summary panel should state that captured evidence is waiting for the next **12:00 Asia/Shanghai** release.

After publication, the existing bilingual summary panel remains unchanged for readers.

## 9. Retired production behavior

The following production paths are retired:

- Evidence-import-triggered model review;
- one-minute model-review cron;
- Gallery `OPENAI_API_KEY` dependency;
- automatic model calls from `/api/admin/article-summary/review-run`.

Legacy review code may remain in the repository temporarily for migration/history, but it must not be reachable from the production execution path.
