# 2026-10-10 18:49 CST — Bilingual title switching repair

User: “标题添上了但是中英文没切换过来”

## Completed and verified
- Root cause: the previous DOI-verified English-title backfill was materialized in the derived Pages supplement without `titleZh`, and Chinese rendering falls back to English.
- Across all seven existing source datasets outside the compressed historical baseline, 0 of the 125 restored DOI titles had a reusable DOI-specific `titleZh`.
- Added 125 chemistry-aware Chinese translations keyed by DOI in three `audit/title-backfill/verified-title-zh-20261010-part*.json` manifests.
- Build-time pipeline populates `titleZh` into derived `literature-supplement.json` and merges offline mappings into `title-translations-zh.json`, before architecture/catalog/search generation. Original English remains intact.
- PR [#489](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/489) merged into `main` as commit `7968926e5c8127a5c7bff62f6ec7301c694caa63`.
- Branch regression [#38046125722](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046125722) PASS: 125/125 Chinese, 125/125 English preserved, 0 missing Chinese in this batch; offline Chinese-title resolver and six negative checks passed. Fixed-slot release authorization passed; 938 DOI membership, protected static sources, publication slot, TOC/figure/PDF unchanged.
- Live Pages deployment [#38046179162](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38046179162) was `pending` at last read; an earlier Pages build [#38045643772](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38045643772) was still in progress and held the Pages concurrency slot. **Do not claim current public UI already updated without a successful Pages run and live check.**
- This repair covers the 125 recovered-title DOI cohort. The whole-catalog Chinese-title completeness outside that cohort has not been fully verified. Do not claim that all 938 papers have Chinese translations.

## User-facing response body
已定位并修复：上一轮补齐的 125 篇只有英文原题，中文 `titleZh` 没有回填，所以选择中文时会回退显示英文。

本次已补齐 125 篇化学专业中文标题，并将中英对应关系固定到生成的卡片与检索数据中。测试结果：125/125 中文标题、125/125 英文原题、0 篇本批中文缺失；未改变 938 篇文献的 DOI 集合、每日 08:00 发布规则、TOC 或 PDF。PR #489 已合并，离线切换解析及异常数据测试通过。

正式 Pages 发布 #38046179162 仍在排队，尚未完成线上验收；不能说网页已经全部生效。