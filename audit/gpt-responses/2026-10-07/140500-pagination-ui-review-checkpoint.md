Beijing date: 2026-10-07
Context: approved pagination UI continuation; architecture and media acquisition excluded.
Base: 86f23922054fe480376f0630f555bfc8b0432e5b
Status: branch-only refinement, not deployed.

User-visible progress messages:
继续处理翻页和简单界面问题，不动架构。先核对现有改动，再补查手机排版、指定页跳转和测试结果。
我查了 Ant Design 和 GOV.UK 的分页范例，会保留居中大按钮、页码高亮和直接跳转；手机端另做窄屏检查。
复查发现，上一版在窄手机屏幕上仍可能挤出横向滚动。我会把手机翻页按钮与页码分行，保留大点击区域。

References checked: https://ant.design/components/pagination/ ; https://design-system.service.gov.uk/components/pagination/

This change keeps existing 12/24 row limits and publisher/data flows unchanged. Adds a pagination-only stylesheet and import; prevents compact 6/7-page totals from producing oversized number rows; adds 14,760 model invariants plus a deterministic Chromium/WebKit acceptance workflow with browser diagnostics and screenshots. Local model invariant run passed. Full browser/deployment acceptance is pending; do not close feedback or claim production delivery from this checkpoint.
