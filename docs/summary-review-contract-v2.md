# Organic Synthesis Gallery — GPT Literature Review Contract v2

Status: normative contract for future GPT draft/audit generation.
Public summary generation MUST NOT run from the public GET route.

## 1. Evidence first

Every summary is derived only from the current Article Evidence Packet v2.

Evidence coverage is explicit:

- `abstract_only`: only the abstract or equivalent frontmatter text was captured.
- `partial`: some article-body evidence was captured, but the captured material does not justify calling it complete main text.
- `complete`: the captured main article provides sufficiently broad article-body coverage for a full-paper summary.

Coverage is not a quality score. It limits what may be claimed.

Evidence storage follows a capture-what-is-present rule. There is no application-level total text/character budget that truncates an otherwise valid article evidence packet. Publisher/platform transport limits remain operational constraints, not semantic sampling rules.

Once any valid evidence level (`abstract_only`, `partial`, or `complete`) has been stored for a DOI, that DOI leaves the normal high-frequency evidence backlog. A later evidence-upgrade policy may revisit it separately, but the main TOC/body/evidence loop must not repeatedly reopen abstract-only or partial articles.

If a later capture changes `sourceHash` or `evidencePacketHash`, the prior summary is superseded and must be re-reviewed.

## 2. Required scientific content

When supported by evidence, the reviewed summary should cover:

1. **Key reaction / strategy**
   - What transformation or synthetic strategy is established.
   - Main bond(s) formed/broken and reaction class when explicit.
   - Do not infer structures or reaction classes that are absent from text/captions/tables.

2. **Key conditions**
   - Catalyst, ligand, photocatalyst, metal salt, acid/base, reagent, additive.
   - Solvent, temperature, time, atmosphere.
   - Light source / wavelength or electrochemical electrode/current/potential when relevant.
   - Yield, ee, dr, regioselectivity or other selectivity metrics when explicitly supported.
   - Missing conditions must be reported as missing, not guessed from field conventions.

3. **Substrate scope and limitations**
   - Functional-group tolerance.
   - Electronic/steric trends.
   - Regio-, chemo-, diastereo- and enantioselectivity trends.
   - Failed, low-yielding, or explicitly limited substrate classes when evidence exists.
   - Late-stage or complex-molecule examples when explicitly present.
   - An abstract statement such as “broad scope” is not equivalent to detailed scope evidence.

4. **Mechanism**
   Mechanistic content must be separated into:
   - `experimentalEvidence`: control experiments, radical clocks, quenching, CV, spectroscopy, isotope effects, trapping, labeling, kinetics, etc.
   - `authorProposal`: a mechanism/catalytic cycle proposed by the authors.
   - `modelInference`: model-only extrapolation. This field must be empty for an auto-publishable summary.

   A proposed mechanism must never be rewritten as experimentally demonstrated unless the evidence supports that wording.

5. **Novelty / synthetic significance**
   - State what limitation the work addresses and its synthetic value.
   - Prefer concrete advantages over generic praise.
   - Distinguish the authors' stated novelty from cross-paper/model inference.

6. **Limitations**
   - Explicit limitations from the paper.
   - Missing scope/condition/mechanistic evidence caused by evidence coverage.
   - Do not hide uncertainty.

7. **Questions requiring manual verification**
   - Record unresolved points that matter scientifically.
   - Examples: exact standard conditions absent from captured evidence; scope claimed but examples not captured; mechanistic claim lacks captured control experiments; SI-dependent detail not available.

## 3. Provenance labels

Every factual claim used in the reviewed record must be classifiable as one of:

- `experimental_fact`
- `author_conclusion`
- `author_proposal`
- `metadata_fact`
- `model_inference`
- `insufficient_evidence`

Auto-publication rejects any final factual claim whose only support is `model_inference`.

Every key claim must reference one or more evidence IDs:

- section: `sNNN`
- caption: `cNNN`
- table: `tNNN`

## 4. Evidence-level restrictions

### abstract_only

The model may summarize only information explicitly contained in the abstract/frontmatter evidence.

It must not:
- reconstruct standard conditions from general chemistry knowledge;
- claim detailed substrate scope from “broad scope” language alone;
- describe a detailed mechanism unless the abstract explicitly states it;
- invent limitations or failed substrates.

The public summary must visibly disclose that it is based on Abstract evidence.

### partial

The model may use all captured sections/captions/tables, but must disclose missing coverage when material needed for a conclusion is absent.

The public summary must visibly disclose that it is based on partial article text.

### complete

The model may produce a full-paper summary, but must still separate evidence, author proposal, and uncertainty.

## 5. Draft schema

The first model pass produces structured facts only, not Chinese/English public summary prose. Public bilingual prose is generated only by the independent audit pass after deterministic validation.

Required top-level fields:

- `doi`
- `evidenceLevel`
- `researchObjective`
- `keyTransformationOrStrategy`
- `conditions`
- `substrateScope`
- `mechanism.experimentalEvidence`
- `mechanism.authorProposal`
- `mechanism.modelInference`
- `noveltyAndSyntheticSignificance`
- `limitations`
- `questionsForManualVerification`
- `claims[]`

The research objective, key transformation/strategy, novelty/significance, explicit limitations, conditions, scope, mechanism items, and each `claims[]` item must carry Evidence IDs. Evidence gaps may carry an empty Evidence-ID list only when explicitly typed as missing evidence rather than as a factual claim.

Each `claims[]` item contains:

- `claim`
- `claimType`
- `evidenceIds[]`
- `confidence`
- `notes`

## 6. Independent audit pass

The audit pass must check at least:

- unsupported claims;
- numerical mismatches (yield, ee, dr, temperature, time, loading, equivalents);
- condition mismatches;
- substrate-scope exaggeration;
- mechanistic overclaim;
- author proposal presented as fact;
- missing major limitation;
- contradiction between sections/captions/tables;
- evidence IDs that do not support the stated claim;
- evidence-level violations.

Audit outcome:

- `pass`
- `needs_manual_review`
- `reject`

Only `pass` may enter the public summary cache automatically.

## 7. Public bilingual rendering

Chinese and English versions must express the same reviewed scientific facts.

Recommended readable order:

1. 核心反应 / Core transformation
2. 关键条件 / Key conditions
3. 底物范围与选择性 / Scope and selectivity
4. 机理证据与作者提出机理 / Mechanistic evidence and author proposal
5. 局限与合成价值 / Limitations and synthetic significance
6. 待确认问题 / Questions requiring verification (only when non-empty)

The public renderer must display the evidence coverage label:
- 基于 Abstract / Abstract-based
- 基于部分正文 / Based on partial article text
- 基于完整正文 / Based on complete article text

## 8. Non-negotiable prohibitions

- Never fabricate missing conditions, scope, yields, selectivity or mechanism.
- Never treat title/category inference as experimental evidence.
- Never treat a proposed catalytic cycle as proven mechanism without supporting evidence.
- Never claim the article was fully read when evidenceLevel is `abstract_only` or `partial`.
- Never expose the raw private publisher text through the public Gallery API.


## 9. Backend execution contract

The production review runner is disabled unless both conditions are true:

- `OPENAI_API_KEY` is configured as a backend secret.
- `SUMMARY_REVIEW_ENABLED=1`.

Default models:

- Draft / evidence extraction: `gpt-5.6-terra`
- Independent audit: `gpt-5.6-sol`

Both calls use the OpenAI Responses API with `store:false` and strict JSON Schema Structured Outputs.

The application does not impose a total-character limit on the stored Article Evidence Packet. The GPT runner also does not silently truncate evidence to fit a request. If an evidence packet cannot be processed within model/API limits, the job moves to `needs_manual_review`; it must not publish a summary based on an arbitrary prefix, suffix, or sampled subset.

Evidence with `textProcessingPolicy=no_external_ai` is never sent to OpenAI. Evidence with `textProcessingPolicy=unknown` is blocked unless `SUMMARY_ALLOW_UNKNOWN_POLICY=1` is explicitly configured.

A successful Article Evidence Packet v2 import schedules a DOI-targeted review immediately through the Worker execution context, while the browser capture returns without waiting for model output. The cron runs every minute as a fallback and handles at most one backlog review job per invocation. Fresh Evidence candidates are ordered by `capturedAt`, so historical review backlog does not take priority over newly captured papers. A failed review job cannot block TOC, body-image, Evidence capture, or public Gallery reads.

Operational target: start the summary latency clock when an official TOC is newly stored. If the same visit does not store usable Evidence, Bridge records a one-hour local Evidence urgency marker; that DOI outranks the normal media backlog and receives bounded short-interval Evidence retries before falling back to the ordinary retry policy. Once usable Evidence is stored, the Worker immediately targets that DOI for review and the one-minute cron remains the recovery path. When external-AI processing is enabled, the API key is configured, publisher access remains usable, and both deterministic checks plus the independent audit pass, the approved bilingual summary should enter the public summary cache within 60 minutes of TOC capture. `needs_manual_review`, `reject`, blocked processing policies, missing credentials, publisher/authentication failures, and upstream model/API outages are fail-closed exceptions and must never be auto-published merely to satisfy the latency target.

A D1 `summary_review_mutex` row provides the atomic DOI/evidence-hash lease. R2 stores durable job/review artifacts, but R2 write-then-read is not treated as an atomic mutex. A cron invocation and an authenticated manual review run therefore cannot both issue model calls for the same DOI/evidence packet.

After the Sol audit produces bilingual prose, a second deterministic numeric check rejects any yield/selectivity/temperature/time/loading/equivalent/light/electrochemical value that does not occur anywhere in the current Evidence Packet.

The default rolling 24-hour backlog publication limit is 96 reviewed summaries (`SUMMARY_REVIEW_DAILY_LIMIT`). A separate fresh-Evidence reserve defaults to 48 (`SUMMARY_REVIEW_URGENT_RESERVE`): Evidence captured within the current one-hour SLA window may use that reserve after the backlog limit is reached, so historical backfill cannot consume all capacity needed by newly captured TOCs. The combined hard limit remains a cost/runaway guard. The runner confirms its R2 lease after writing it so a cron invocation and an explicit manual review run cannot both proceed with the same job.

Private R2 objects:

- `private/article-evidence-v2/*` — captured source evidence.
- `private/article-summary-jobs/*` — durable review state.
- `private/article-summary-review/*` — draft + audit evidence.
- `private/article-summary/*` — approved public-summary derivative cache.

Only an approved `reviewed-summary-v2` object whose `sourceHash` and `evidencePacketHash` still match the current Evidence Packet may be returned by the public summary API.
