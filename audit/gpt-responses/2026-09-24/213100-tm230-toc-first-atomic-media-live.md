# GPT response sync

Beijing time: 2026-09-24 21:31
Context: Tampermonkey 2.2.30 TOC-first scheduler, atomic paired-media publication, and historical staged backlog drain
Related commits: 3f37a149d24928d7356922c4ee85721421d748c3, 414db988155b0351dd9e81dae80ab0dd2cb27cb8

继续完成了。现在这条链已经从“设计/测试”进入正式生产，而且 backlog 也已经排空到安全边界。

当前正式状态：

- Bridge **2.2.30** 已在 `gallery.gczhouwld.com` 上线，最新的 `Verify Tampermonkey 2.2.30 live`、`Verify Bridge 2.2.30 live`、live progress 都是 **success**。
- 调度已经改成三层：
  1. **当天/最新一次 Gallery 新增文献优先全部处理**；
  2. **历史缺官方 TOC 的文献全部优先补 TOC**；
  3. 前两层清完后才进入**历史正文图 backlog**。
- 同一层内部期刊优先级固定为：**Nature → Science → Nature 子刊 → Science 子刊 → JACS → Angew → Chem → 其他**。
- 当前队列已经识别 `latestAddedDate = 2026-09-24`，今天新增 **24 篇**，所以你截图里的 `10.1021/acs.joc.6c01846` 属于“今日新增优先层”；它已经有 TOC 时会直接完成正文图，但它不会再压过“历史缺 TOC”层以外的规则。

TOC 和正文图现在也已经改成你要求的“**同一篇、同一次 Pages 构建同步上线**”。流程是：先在同一构建合并官方 TOC，再检查 Tampermonkey 的 final capture packet；只有 DOI/page/source/hash/字节/图片解码全部通过，才把该 DOI 的正文图一起发布。任意一张失败，**整篇 hold，不允许半套上线**。

历史正文图也已经实际清仓，而不是只改代码：
- 第一轮：**25 篇 / 84 张**正文图；
- 第二轮：**22 篇 / 88 张**；
- ACS Catalysis 文件名规则修复后第三轮：**5 篇 / 17 张**；
- 当前自动补发累计 **189 张**；
- 加上此前已经公开的正文图，现在生产站共有 **542 张正文图**。
- 你截图里的 `10.1021/acs.joc.6c01846` 的 **Scheme 1–3 已正式上线**。

最后一次生产 `Publish validated new body figures` 检查结果是：
`count = 0, articles = 0, ready = false`。
这意味着 Worker 虽然仍保留 staged 记录作为审计/去重证据，但按照当前严格规则，**已经不存在“安全合格但尚未公开”的历史正文图 backlog**。也就是说，之前已经抓取且能通过完整安全校验的正文图已经全部上线到位。

对应核心生产提交：
- 2.2.30 主调度/原子媒体发布：`3f37a149d24928d7356922c4ee85721421d748c3`
- ACS Catalysis 历史文件名兼容 + live verifier 修复：`414db988155b0351dd9e81dae80ab0dd2cb27cb8`

如果你本机 Tampermonkey 面板还显示 **2.2.29**，直接用 `https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js` 原位更新到 **2.2.30**；不要卸载旧脚本。
