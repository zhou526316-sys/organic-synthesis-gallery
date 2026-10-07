Beijing date: 2026-10-07
Context: approved pagination UI repair; no main.ts/data/architecture/media changes.
Parent: 2c5647d236955a2658e9ef1f509682ccd2443675

A second bounded observation-only diagnostic run 37584142493 (side branch diagnose/pagination-release-events-20261007, no PR) produced artifact 11466167197, 1758553 bytes, SHA256 287841fe689057028312fbea3d6bd03abc07ca2c7fcd5bac490b095ef9cae2b5 verified after download. All four old failing assertions were retained. Native WebKit pointerdown actually targeted page 2 at (553,704), but getBoundingClientRect during that same event had already moved its rectangle to y=786 (Hot) or y=804 (D1). Therefore the prior rectangle-based release guard wrongly rejected the stationary legitimate mouse release. Button remained connected; no DOM replacement occurred.
The added 320px test had a separate preparation defect: its point was y=1004 outside the 900px viewport, and pointerdown targeted HTML, not a button. Replaced hand-computed pre-layout coordinates with native Playwright hover actionability and added a required assertion that the real down target is page 2. The deliberately forced 120px translation, page-1-before-release, page-2-after-release and drag-away/Enter assertions are unchanged.

Implementation trusts the browser native down target and saves the actual down coordinates. Recovery requires <=6px actual pointer displacement plus proven layout movement (including a mismatch already present during first rectangle measurement), an enabled/connected/visible same button and an actual non-keyboard click. It does not activate on press or release alone. Existing native clicks, touch and keyboard are unchanged.
Local browser execution was attempted on the exported fixture but sandbox browser navigation to localhost was blocked; no local browser pass is claimed. GitHub Actions remains the acceptance authority.
Status: branch candidate pending full browser/gate tests; not deployed.

Progress text:
普通跳页仍能通过，但强制移位测试和完整回归还未通过。我会补查事件细节，避免用反复重试掩盖问题。
进一步确认：按钮刚被命中，位置测量就可能触发重排，旧校验因此误判。另一个手机补测点到了屏幕外；我会修正测试准备，但保留移位后的跳页断言。
