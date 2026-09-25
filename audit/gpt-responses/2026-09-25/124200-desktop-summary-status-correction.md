# Status correction — desktop summary enlargement

Beijing time: 2026-09-25 12:42 +08:00
Context: user asked “还没有改好吗”.
Verified from repository audit commit f173170140eb4d0e7d327db5445a78f0cfb19276 and response sync commit 10621841ed0b51640d0fb7bfb048c288d9ead5e8:
- PR235 merged as e14f98449d5159e71c540e583ec188bdb5159998.
- GitHub Pages deployment run36083767613 success.
- Worker frontend sync run36083767614 success.
- Live summary run36084017822: GitHub/Worker × Chromium/WebKit all10/10.
- First half of combined feedback remains intentionally unmodified.

## Final user-visible reply

已经改好并上线了。

这次只改你批准的第二条，第一条“抓 TOC 时顺便生成全文摘要”没有动。

桌面全文摘要窗口现在是：
- 最大宽度：1080px → **1440px**
- 最大高度：86dvh / 900px → **89dvh / 1000px**
- TOC / 正文比例：34% / 66% → **30% / 70%**，正文区域更宽
- 手机端 ≤680px：**保持原尺寸，不跟着放大**

实测尺寸：
- 1600×1000：**1440×890**
- 1280×900：**1248×801**
- 390×900 手机：**366×774**，与之前一致

对应 PR #235，产品提交是 `e14f984`。上线后的最终验收 run `36084017822` 在 **GitHub Pages / Worker × Chromium / WebKit** 四路均 **10/10 通过**。

所以现在你刷新网页，电脑端的全文摘要窗口已经是新版大窗口。
