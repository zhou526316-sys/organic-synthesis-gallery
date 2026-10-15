# Organic Synthesis Gallery DOI and publisher first-online date remediation status

Beijing time: 2026-10-15T19:23:44.706+08:00
Conversation context: user asked "把问题解决了吗？" after screenshots showing DOI line-breaking/DOI click errors and 2026-10-15 "(待核实)" publisher dates.

## Answer (user-visible content of this turn)

**截图中的 DOI 显示、点击异常和部分日期错误已经修复并部署，但全站日期的独立出版社逐篇核验还不能宣称全部完成。**

- DOI: PR #673 fixed whole-corpus DOI wrapping and DOI identity, PR #676 restored canonical clickable DOI links after user-shell decoration, PR #688 unified official publisher article links on both layers. Nature 10.1038/s41586-026-11242-8 now routes to exact Nature article landing without broken DOI segments.
- Dates: Nature 10.1038/s41586-026-11242-8 explicitly evidenced publisher-first-online 2026-10-14 and six authors. Five Oct-14-admitted JOC DOI now have DOI/title-specific ACS Oct-15 dates. Ten Chemical Science/Green Chemistry papers received RSC DOI/title-specific first-published dates. PR #637 preserved prospective date uncertainty rather than falsely publishing a future Crossref date.
- Release: PR #688 merged, official Pages #38718803061 succeeded. `audit/deployment-delivery-latest.json`: ok true, run 38718803061, 1151 papers, verifiedAt 2026-10-15T10:30:22.702Z, canonical gallery.gczhouwld.com and Pages mirror. `audit/literature-update-state.json`: success-live-verified, galleryDois=1151.
- All-paper regression: "Gallery full-corpus DOI and publisher date regression" #38718802848 passed; scanned 1151/1151 DOI for valid identifier and link shape, without changing protected official sources. Pages build live regression includes "all published DOI links survive user-shell decoration without wrapping or mobile click hijacking"; build/deploy green.
- Current machine date queue: `audit/publisher-date-evidence/pending-latest.json`, asOfBeijingDay 2026-10-15, catalogCount=1151, `unresolvedPublisherFirstOnlineDates=0`, `dateLabelsNotMarkedProvisional=1151`. **This is only the number of unverified flags in the current DOI metadata/display queue, NOT proof of 1151 independent publisher first-online date verifications.** Continue DOI-source provenance checks for new arrivals.
- Conclusion: the user-screenshot regression is corrected according to code, full-corpus CI, and live Pages receipt. If older browser cache still shows a broken DOI or "(待核实)" label, force reload once; further concrete DOI evidence would help pinpoint any remaining case. Do not claim all original bibliographic dates have been independently audited.

## GitHub source links
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/637
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/673
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/676
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/688
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38718802848
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38718803061
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38720754963

No production paper data was modified in this status check. No schedule was modified. All correspondence provenance retained.
