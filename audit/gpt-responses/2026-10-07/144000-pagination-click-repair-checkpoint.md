Beijing date: 2026-10-07
Context: user approved continuing the existing pagination repair, merge and verification. UI only; no architecture, PDF Vault, Tampermonkey, media acquisition or publication-data changes.
Parent: 2a2a12c51d882ab2a8f76fb1dc61b60319b5f33c

Timeout preflight: avoid full job logs and large source replies. Ran an isolated 7-minute-capped diagnostic workflow, extracted only two failing tests and a 639435-byte artifact. No production writes.
Diagnostic run 37582362165, artifact 11464978520 SHA256 479c9912691b8b0ec2ad0e2afa44e7313b527bcb09dc4d07322c1f9692317f4c verified locally.
Both original failing assertions reproduced without changing them. Mouse pointerdown/mousedown target page 2; pointerup/mouseup/click target MAIN or ARTICLE within 1 millisecond, with page 1 unchanged. No pagination-mutation intervened. This is a mouse hit-target/late-layout issue, not evidence of an API cursor failure.
A non-publishing merge trial against 65f853ca7078d9231e17c1998afd8d1c2f61def1 completed cleanly (src/main.ts and src/styles.css auto-merged). Earlier mergeable=false is not a current conflict proof.

Repair: native mouse pointer capture only for enabled pagination buttons; activation stays on click, drag-away cancellation stays enforced against the original hitbox, touch and keyboard are unchanged. Added deterministic footer-shift, drag-away and Enter regressions. Preserve all original pagination assertions and data/DOM bounds. Existing archive suite hardcodes WebKit, so it runs in the WebKit matrix job rather than failing for a missing WebKit binary in the Chromium job. Both browsers still run the full new layout/pointer suite. Removed the one-shot diagnostics workflow after collecting evidence.
Status: committed branch candidate; fixed browser and release acceptance pending. Do not claim deployed.

User-visible progress:
继续处理分页的回归失败和合并冲突；通过检查后再验证正式网页，不改动架构或 Tampermonkey 抓取链路。
复核确认，上一轮确实存在“点击页码后仍停在第 1 页”的失败，不只是排版问题；这一轮先定位它。
我会记录页码点击前后的事件和页面变化，区分点击丢失、数据加载失败与页码被重置，并核对冲突文件。
定位到了：鼠标按下时命中了“第 2 页”，松开时却落在页面空白或文献卡片上，点击因此丢失。最新合并试跑也未发现实际冲突。
