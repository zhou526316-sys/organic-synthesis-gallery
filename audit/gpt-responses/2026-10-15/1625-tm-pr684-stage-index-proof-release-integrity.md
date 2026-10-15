# Tampermonkey approved repair continuation — R2 index measured, literature gate isolated
Date: 2026-10-15, Asia/Shanghai (Beijing afternoon). Conversation: 用户“继续” following approved TM PR #684 repairs and release blocker.

## Durable read-only production diagnosis

- [GitHub Actions #38705066633](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38705066633), run succeeded. This was triggered by a **read-only** sanitized metric addition to `.github/workflows/tm-local-acceptance-read.yml` (commit `e958e6678257d8b7272af9014605f36b8d6bc634`). No changes to R2 object/media/PDF or protected formal literature during diagnostics.
- Exact original R2 file: `local-captures/article-figures/stage-index.json`. The job read the existing object, validated JSON structure, and emitted only safe counters:
  - `byteLength: 6004600`
  - `decodedCharacters: 6000531`
  - `legacySixMillionCharacterLimitExceeded: true`
  - `newThirtyTwoMiBByteLimitExceeded: false`
  - `validJsonObject: true`, `validItemsObject: true`
  - `indexItemCount: 3798`, `readOnly: true`.
- This conclusively confirms `cloudflare/worker/src/stage-storage.js`'s legacy `raw.length > 6000000` check was wrongly rejecting a valid stage index, producing `stage_storage_index_read_index_invalid` for new image uploads. Existing 3798 receipts must not be wiped or reset. PR #684's bounded 32 MiB reader/CAS update is targeted to this measured failure. Real new uploading after deployment remains unverified.
- Uploaded browser diagnostic available at prior read-only [#38699137996](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38699137996) is still 6.2.66, with 340 tasks and 29 DOI visits at checkpoint; don't present this as new 6.2.67 browser acceptance.

## PR #684 status and approved scope

[PR #684](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/684) head `361d7e44c0112ebb62987b87d9fd47619af92a7d`. Contains approved scope only: stage-index reader, consecutive publisher heartbeat circuit breaker and one foreground initialization recovery, owner-only verified local replay of PDF bytes on deadline/5xx. Bridge source `2.2.86`, engine source `6.2.67`; capture protocol 6.2.20, controller 2.2.41 unchanged. 15/15 stage storage tests and 4/4 heartbeat tests passed; 26/27 workflows success on head. **PR OPEN, not merged or deployed.**

Only CI failure [Site quality gate #38702470614](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38702470614), job `116314109803`, is from another workstream's protected publication bytes, not TM. A separate historical PR's Site quality gate #38704774423 also rejects the same inherited mismatch.

## Protected publication mismatch

The immutable 2026-10-15 08:00 publication marker `audit/publication-release-state.json` requires:
`public/rolling-supplement.json` Git blob `f0e4b18a3be71e52fb07e84e291f51f652cd03ae`.
Current main's blob is `28f3238f45b380855f68fc7ab79da03ba4c9f181`.
Latest direct author edit was commit [17ca9862](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/17ca9862a1d397c98d6e8890e9defd1899c66833), modifying only `authors` for existing Nature `10.1038/s41586-026-11242-8`; there were no added DOIs or modified publication dates. Original evidence is in `audit/wechat-working/2026-10-15-r1-nature-science/author-metadata-source-correction.json`.

Nature's [official publisher page](https://www.nature.com/articles/s41586-026-11242-8) (first published October 14, 2026) explicitly gives the same six authors: Hayato Fujimoto; Masayuki Mizutani; Kazuya Imachi; Teruki Nishioka; Reona Ikeda; Mamoru Tobisu. These are correct source-backed authors and must be preserved in evidence; they should not be silently omitted long term.

Protected release agreement `docs/publication-release-contract.md` requires atomic metadata/review/marker authorization for new production literature changes; its only explicitly allowed immediate independent correction path is registered deletion-only out-of-scope DOI removal, not arbitrary author edits or manually forging a marker. Therefore neither the TM PR nor this audit should rewrite the protected marker, waive CI, backdate slots, create late DOI admissions, or fabricate review authority.

Coordinator comments posted to PR #681 (ID 6187667461, updated with publisher corroboration) and PR #684 (ID 6187756662, exact stage size proof).

## Safe recovery decision needed

Only after separate approval from user for the protected-source recovery: possible minimal **snapshot-restoration** transaction is to restore exactly the frozen `public/rolling-supplement.json` Git blob without altering marker, retaining the six verified authors in already committed audit evidence for a next formally authorized metadata update. This changes one already-released paper's working author field back to its formerly empty original state until proper revision; it is a tradeoff and must not occur without explicit approval. No DOI/date/policy/PDF/media may change.

Alternative: preserve the six authors as-is while the literature-owner workflow obtains a new explicitly approved metadata-only correction contract. This is longer and also requires independent authorization; do not invent such a pathway during a Tampermonkey fix.

Next if authorized restoration occurs: verify full protected hash equality, rerun Site quality gate, ensure all PR684 regression statuses green, merge PR without forced ref overwrite, verify production Worker and Pages deployment and HTTP-served Bridge install header on both canonical domains, then obtain genuine user browser 6.2.67 diagnostics. No claim of deployment before actual readback.

## User-visible response synchronization

本轮已确认的实际工作：生产 R2 索引精确为 6,004,600 字节 / 6,000,531 字符、3,798 条且 JSON/结构均有效，旧 600 万字符限制确是 HTTP 500 根因；新增只读工作流已成功执行并将具体证据写到 PR #684。也核实六名作者与 Nature 官网一致，不应擅自撤销。PR #684 三项修复已通过 26 项 CI，单项阻断为受保护文献数据与发布标记不一致，尚未合并/部署。需要对这一项受保护文件恢复或元数据授权作独立决定，不能通过禁用门禁解除。
