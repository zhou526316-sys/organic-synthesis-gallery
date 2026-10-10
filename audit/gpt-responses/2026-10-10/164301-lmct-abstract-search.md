# 2026-10-10 16:43 CST — GPT 响应与实施审计

## User request

“我刚才搜索lmct只出现4篇文献，实际上远远不止，请解决搜索的问题，关于摘要我想这是很好获取的。”

## Verifiable diagnosis

- Main frontend `src/main.ts` filtered only title, Chinese title, DOI, journal, authors, publication date.
- Dedicated D1 `cloudflare/worker/src/literature-catalog-index.js` FTS searchable text also lacked original abstracts and reviewed explanations.
- `public/scheduled-article-summaries.json` has 443 approved reviewed summaries, not original abstracts; at least five contain LMCT variants.
- Published DOI generation is 938 as reported by 2026-10-10 production release. This is not the complete pre-July historical corpus.

## Executed actions

- PR [#472](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/472) **merged into main**, squash commit `2dbd26ddd6ab57794089f2e8d26c3014a626b231`.
- Added DOI+revision+generation-fenced separate FTS enrichment table; matched original abstract and approved interpretations with distinct provenance.
- Added audited chemical alias search LMCT/ligand-to-metal charge transfer and selected conservative Chinese/English equivalents. Unregistered multiword queries retain exact substring matching.
- Added GitHub Actions sync using existing authenticated `BRIDGE_WRITE_TOKEN`, optional `OPENALEX_API_KEY`; source metadata OpenAlex and Crossref. Coverage reports retained, missing abstracts not invented.
- Preserved 08:00-only formal publication; search enrichment never mutates literature membership, images or PDFs.
- Public abstract preview limited to 200 Unicode codepoints plus DOI article link for copyright provenance.
- Added SQLite regression tests, existing CI hooks, standalone migration SQL and `docs/search-abstract-recall-contract.md`.
- Independently smoke-tested the intended FTS SQL and phrase expansion in local Node 22 SQLite: LMCT -> 2 synthetic hits, Chinese equivalent -> 2, 手性磷酸 -> 1, 轴手性 ->1.
- Confirmed workflow runs created for merge commit. At log time `Deploy Worker frontend assets` #38038780442 and `Deploy GitHub Pages frontend` #38038780423 were **queued**, **not deployed**. Abstract index backfill and live end-to-end tests have not succeeded yet. CI checks of PR were also queued.

## User-visible content already delivered

First diagnostic partial:

> 已经从 GitHub 主站代码中定位到一个明确问题：现在的搜索并不是完整的文献主题检索。搜索 LMCT 主要匹配标题、作者、DOI、期刊、日期，没有把英文摘要纳入。2026-10-10 正式目录为 938 篇，不等于所有历史文献；必须同时解决字段缺失和历史收录缺失。

Second implementation partial:

> 检索修复代码已合并至 main：PR #472，合并提交 2dbd26dd。修改覆盖原始摘要、已审核解读和中英文术语检索。但合并不等于上线；Worker 和 Pages 部署任务仍排队，新索引尚未通过验收。

## Final response status and limitations

Code merged but not yet live-verified. Production outcomes cannot be declared successful until Worker/Pages and `literature-catalog-index-shadow` have completed and actual `LMCT` result count, DOI set, and source coverage are checked. The separate 23:00 historical archive process remains out of scope; no claim of all-time exhaustive historical coverage.

Related workflow links:
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38038780442
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38038780423
