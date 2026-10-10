# 2026-10-10 18:02 CST — Search continuation response log

Context: Organic Synthesis Gallery — user asked “继续” following report that searching LMCT returned only four papers; this continuation acts within explicitly approved search repair scope.

## Existing issue and remediation
- Frontend baseline and D1 index had lacked original abstracts and reviewed summaries. Earlier PR #472 and follow-up #475–477 introduced DOI-fenced original abstract + reviewed interpretation index.
- Verified dedicated catalog index: 938 currently published DOIs, every DOI/revision matches; 887 original scholarly abstracts (94.6%), 443 separately approved reviewed summaries, 51 still missing original abstracts, with an independent nightly metadata retry at 23:20 Beijing. The 938 does NOT represent all journals' historical corpus.
- Production search read-only Actions #38042149600 and #38042657870 verified:
  * LMCT exact search 11 (previous user's browser showed four)
  * ligand-to-metal charge transfer 11
  * 配体到金属电荷转移 11
  * 手性磷酸 11
  * 轴手性 23
  * All results were DOI-bounded to the published generation and title-absent abstract-based recall was demonstrated.
- PR #480 (squash b654edd522c06cb978169ffafebfacc13302e386) installed DOI-level end-to-end public read-only acceptance triggered after index sync.
- PR #481 (squash 3d9f817a7b173e0307eb3724ce2150e61383263d) installed Chromium browser acceptance on desktop and mobile; #482 (squash 29d914e07dcc7b4a0b07f063884f550795cf58be) separated viewport tests and added network request trace.
- Browser acceptance #38042657870: desktop all five search probes showed exact matching DOI cards; mobile LMCT English Chinese and 手性磷酸 showed exact results, but mobile axial chirality (轴手性) had two /api/literature/catalog-view POST attempts fail net::ERR_FAILED; frontend permanently downgraded to static metadata only and incorrectly showed nine results rather than 23, no previous warning. This was a true resilience regression, not a false report.

## Current-turn repair (PR #485)
- PR https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/485 merged to main, squash commit `1acfd9924e663db840229d89cfda3dd66ea1b625`.
- Changed `src/platform-api.ts`: on GET health and POST indexed literature view only, use first-party https://api.gczhouwld.com (read-only) first, fallback to workers.dev when first origin fails. Both GET health origins independently passed direct 200 checks. Existing media, PDF, login etc routes untouched.
- Changed `src/main.ts`: a bounded 900ms/2200ms retry for current search when indexed D1 transport temporarily fails, no permanent `indexedViewCapability=false`; ensure incomplete static fallback is explicitly labeled as metadata-only and not definitive all-time count. Successfully indexed response clears degraded banner and retry state.
- Changed `tests/architecture-frontend.spec.ts`: Playwright regressions for primary custom-domain failed / workers.dev backup success, plus two transient request failures followed by recovery. No literature data altered.
- Concurrent literature-title backfill briefly caused protected release marker mismatch in PR checks. A separate project's fix on main at eeb8be588a2191573452c9dbc2f702e92b863d94 restored the canonical `public/papers.gz.b64` SHA to authorized `85a62cf86f1b87047386e2fc4c30bf9eeb4c2353`. We did NOT change that protected file.
- New frontend deploy Jobs were triggered: Pages #38043354801 and Worker sync #38043354810, with Worker deploy #38043381788; as checked at 2026-10-10 18:02 CST, Pages and current Worker deploy were still pending, prior Worker in progress. **Do not claim final mobile production pass yet.** Existing API/direct browser (desktop and first four mobile searches) correctness is established.

## User-visible reply content (progressive)
1. The earlier build had Pages success, initial Worker failure due baseline search regression; diagnosis was stated.
2. Index restoration reported: 938 published DOI, 887 original abstracts, 443 reviewed summaries, 51 outstanding, 94.6% abstract coverage.
3. Live public index acceptance reported 11 LMCT results instead of four, and bilingual aliases and other chemistry queries.
4. Desktop browser 5/5 pass; mobile 4/5 pass and 轴手性 transient failure pending.
5. Network trace confirmed two net::ERR_FAILED and misleading downgraded static nine instead of indexed 23.
6. PR #485 was merged; custom-domain-first, fallback + bounded retry and partial-results banner implemented; Pages/Worker release was triggered but not yet verified.

## Proposed terminal user-visible status
“已完成并合并移动端补强修复 PR #485（提交 1acfd992）。独立 API 域名优先、workers.dev 备用，索引网络故障会有两次限额重试；在只显示静态标题结果时会明确提示不完整。之前正式 D1 检索已验证 LMCT 11 篇、手性磷酸 11 篇、轴手性 23 篇，938 条目录，887 条原始摘要。桌面实际卡片全通过，手机 LMCT 已实测显示 11；造成轴手性手机退化为 9 的链路已修复代码。当前 GitHub Pages 与 Worker 的新部署仍排队/进行中，因此新的手机容错尚不能称已经线上验收完成。现场状态与部署可见链接：PR #485、Pages #38043354801、Worker #38043381788。历史创刊以来未全库入库以及剩余 51 篇摘要仍属于独立后续覆盖事项。”

No secrets or tokens are included. No new off-slot literature admission is authorized.
