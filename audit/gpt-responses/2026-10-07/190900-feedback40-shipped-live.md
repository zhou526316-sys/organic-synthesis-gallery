Beijing time: 2026-10-07 19:09 +08:00
Context: simple UI feedback #40 — remove “正文图片待抓取” and ship live

Related PR: #393
Merge commit: a18d94eac71c1c86904561bd4d4f2d74ed0b42a7

User-visible reply:

已经修复并上线。

这次不是只改分支，而是已经完成了整个链路：

- PR #393 已合并，合并提交为 `a18d94e`。
- `main` 里已经完全不存在“正文图片待抓取 / Article figures pending”文案。
- 无正文图时，正文图片区整块隐藏；后续抓到正文图后会正常重新显示。
- GitHub Pages 发布成功。
- Worker 前端同步成功。
- Worker 前端资产部署成功。
- 正式站点只读验收通过：页面完整加载后没有出现中英文待抓取文案；无正文图的卡片区域确实处于隐藏状态，有图卡片正常显示。

另外，之前卡住合并的 PDF Vault `cards.mjs` TypeScript 声明缺失，也用最小声明文件补齐了，只解决编译，不改 PDF 运行逻辑。

现在刷新 Gallery 即可看到结果。