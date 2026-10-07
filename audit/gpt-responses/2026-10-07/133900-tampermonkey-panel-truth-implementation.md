# Tampermonkey panel truth fix — approved batch 1

北京时间：2026-10-07 13:39 +08:00
User approval: 用户在 13:31:57 对已列出的分批方案回复“可以”。本批实施最近进度时间、无任务 PDF 文案和只读中断/控制页识别；自动断点恢复与资源分层错误展示留在后续批次。

Base source blob: b95133e2bbdca6629d360b6f61a63648cc3db1ea.

Changes: separate batch start from genuine progress; choose latest valid same-generation events; hide prior-generation active row and summary; show no-job PDF as waiting; distinguish current/foreign held leases from interrupted manual passes; preserve pause/completed/wait priority; ignore obsolete local stop reasons when another page owns a new run. No lease/control writes, remote polling, publisher visits or media policy changes were added to the observer.

Release candidate: Bridge 2.2.60, install 6.2.41. Capture protocol remains 6.2.20, controller 2.2.41, RSC publisher adapter v14. Packaging version assertions updated alongside the source.

Local validation: 31 observer assertions and 12 task-window/lease regression assertions passed. Syntax passed. Browser/packaging acceptance is handled by the bounded read-only tm-panel-state-regression workflow on this repair branch; it tests current source directly and does not apply legacy source-rewriting fragments. Publication status must be checked separately before presenting this release as live.
