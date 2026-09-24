# Organic Synthesis Gallery — coverage warning publication-gate correction

Recorded for the 2026-09-24 08:00 Asia/Shanghai publication slot.

## Outcome

The earlier all-or-nothing behavior was corrected. A nonzero `sourceCoverageAnomalies` count is no longer, by itself, a global fixed-slot publication blocker when the configured Crossref and OpenAlex source families remain healthy, the paired latest/compact generation is consistent, the full candidate set is present, and the DOI has completed evidence-based two-pass semantic review.

For this slot:

- fresh machine audit run: `35934774504` — success
- compact/latest generatedAt: `2026-09-23T23:41:25.964Z`
- compact handoff blob: `c988f7e2e2213fc38459b10422cc31a85ba522b6`
- compact snapshot commit: `c20198e7301d6c0adfa462b391a3f313a8fb4ff5`
- reviewed: 123
- include: 15
- exclude: 106
- article-level pending: 2
- publishableDois: 15
- deferredDois: 2
- criticalSourceFailures: 0
- sourceFamilyGaps: 0
- historicalCoverageLosses: 0
- sourceCoverageAnomalies: 2 (Nature, CCS Chemistry)
- closureCoverageAnomalies: 8
- verifiedThrough remains: `2026-09-20`

The two coverage warnings remain explicit closure/coverage warnings. They hold closure and `verifiedThrough` advancement and must be rechecked by later audits, but they do not clear or suppress the 15 already discovered, fully reviewed include DOI(s).

## Scope/protocol correction

Canonical scope version is now `scope-2026-09-24-v1`.

Relevant commits:

- scope contract: `7a617ae740205a936afa42127abb5858993d85ce`
- update protocol: `c637233cd088b4a1097a92e416a5a77a18ea791a`
- prepublish validator: `4254de5824c58f42558539eff9b2a46f0efd4880`
- slot readiness gate: `1b047ed33a5af6b208833a831319a88732ea3d02`
- post-release quality gate: `4c82b63f978911c39bc097c9dc6a1e0c80623404`
- release finalizer: `51f9379c2645339739b9893f1ced1dcc15cb7043`

The formal converter/frozen-release validator were also aligned with the scope contract: detailed evidence/challenge fields remain mandatory for include, pending, and high-priority/high-relevance exclude decisions; an obvious normal-priority exclude may retain a concise reason rather than being forced to carry include-level evidence prose.

Final converter/authorization commits:

- converter: `46e64afd1b02760e605788b2d808a61595adcacc`
- frozen release authorization: `69af8d4788297a8c52a4e6d0416e33361de05720`
- regression alignment: `8bd8711df954823e0d62027bf714f87317ce8adc`

## Actual GitHub prepublish gate

Final staging commit validated by GitHub Actions: `b215a5e0b9341f1ac55cce1e7522fa6b2c74376b`

Prepublish gate run `35937638326`: **success**.

All steps passed, including:

- complete handoff validation
- per-DOI regression suite
- deterministic formal conversion tests
- scope correction/title tests
- formal conversion preview
- `validate-prepublish-review.mjs --allow-deferred --require-ready`
- `check-prepublish-readiness.mjs --allow-deferred --require-ready`
- strict release bundle generation

State commit: `966acf2d43cd636fe5b2aedc565d85975a8f92ce`.

Current state is `ready_with_pending`, with `publicationReady=true`, 15 DOI(s) in `publishableDois`, and the two genuine article-level evidence gaps in `deferredDois`.

## Production boundary

This correction task did **not** modify production `public/` literature data, did not deploy Pages, did not alter TOC/media data, and did not change any schedule. The existing fixed-slot production release transaction is expected to consume the now-valid 15-DOI allowlist; the two semantic pending DOI(s) remain outside production.

Media acquisition remains delegated to Tampermonkey/VPN Bridge. `verifiedThrough` is intentionally not advanced while the coverage/closure warnings remain.
