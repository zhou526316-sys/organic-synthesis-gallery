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

The first model pass produces structured facts, not public prose.

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
