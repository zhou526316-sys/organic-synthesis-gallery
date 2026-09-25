# Desktop summary enlargement — user-approved second half only

Beijing time: 2026-09-25 09:58 +08:00
Context: user said “只改第二条” for the newest R2 feedback.
Product merge: e14f98449d5159e71c540e583ec188bdb5159998 (PR235).
Audit record: audit/ui-feedback/2026-09-25-095800-desktop-summary-larger-release.json, commit f173170140eb4d0e7d327db5445a78f0cfb19276.
Live run: 36084017822, GitHub/Worker × Chromium/WebKit all 10/10.
Combined R2 feedback remains open because TOC-time summary generation was intentionally not changed.

## Final user-visible reply

**只改第二条已经完成并上线。** 第一条“抓 TOC 时顺便生成全文摘要”没有改。

桌面全文摘要窗口现在从原来的 **1080px / 86dvh / 900px**，放大为最多 **1440px / 89dvh / 1000px**；同时把 TOC/正文比例从 **34%/66%** 调成 **30%/70%**，正文横向空间更大。手机端 <=680px 仍保持原来的尺寸规则，没有跟着放大。

实测尺寸：
- 1600×1000：**1440×890**
- 1280×900：**1248×801**
- 390×900 手机：**366×774**，与之前一致

对应 PR #235，产品提交为 `e14f984`。合并前 10 个当前头工作流全部通过；上线后 run `36084017822` 在 **GitHub Pages / Worker × Chromium / WebKit** 四路均为 **10/10 通过，0 failed/skipped/flaky**。

[查看 1600×1000 桌面实测图](sandbox:/mnt/data/desktop-summary-live-1600.png) · [查看 1280×900 桌面实测图](sandbox:/mnt/data/desktop-summary-live-1280.png) · [查看手机未放大对照](sandbox:/mnt/data/desktop-summary-mobile-control.png)

[查看本次完整测试与上线证据](sandbox:/mnt/data/desktop-summary-release-evidence.zip)

这条合并吐槽仍保持 **open**，因为它的第一部分你明确没有让我改；本次没有修改摘要生成逻辑、TOC 抓取、文献数据、阅读人数、抓图链路或其他界面功能。
