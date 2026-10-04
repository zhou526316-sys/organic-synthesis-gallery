# Response synchronization

北京时间：2026-10-04 22:00 +08:00
上下文：接续 Organic Synthesis Gallery Tampermonkey/VPN Bridge；仅 Chem / Chemical Science / Green Chemistry / CCS Chemistry 抓取与发布链，不触碰 discovery/audit/release。

相关功能提交：
- cc9e029727e08bb9d1f651196f3b69130e450865
- b3515d39978e753cf7d309967e5b87356672f7c7
- asset-only deployment run: 37207560316

## Final response

已经接续完成，而且仍严格限定在 **Tampermonkey / VPN Bridge 抓取支线**，没有动文献发现、审核、补扫或 08:00 正式发布链。

这次查到了一个比出版社适配器更基础的真实问题：**v9 代码已经进了主线，但 Bridge 的 Tampermonkey `@version` 仍是 2.2.43**。如果你电脑此前已经安装过另一个同样标成 2.2.43、内部却还是 v7 的构建，Tampermonkey 不会把“同版本号、不同内容”当成正常升级。这也解释了为什么实时回执一直还是旧的 `publisherMediaRevision=20261004-publisher-sources-v7`。

我已经把这条发布链补完整了：
- PR **#311** 已合并：Bridge **2.2.43 → 2.2.44**，合并提交 `cc9e029727e08bb9d1f651196f3b69130e450865`。
- PR **#312** 已合并：修复专用 **Tampermonkey asset-only Pages 部署触发器**，合并提交 `b3515d39978e753cf7d309967e5b87356672f7c7`。以后 Tampermonkey runtime/build 输入变化会独立发布，不再被文献正式发布时段门禁卡住。
- 专用发布 run **37207560316** 已全部成功；它只覆盖 `gallery-vpn-bridge.user.js`、Runtime 和 `toc-mainline.user.js`，并验证其余现网页面文件 byte-identical。
- 现网冷读取已经确认 **`@version 2.2.44` + `publisherMediaRevision=20261004-rsc-elsevier-ccs-v9` + Elsevier bound-task v3**。部署门禁同时逐项验证了 RSC Graphical Abstract、CCS `key image` 和 `addedDate >= 2026-10-01` 的 PDF 截止逻辑。

但我现在**不会宣称 Chem / CCS 已经恢复**。截至刚才，真实浏览器回执仍是你电脑升级前的旧运行：Chem 还是 `controllerRevision=2.2.39`，最后失败为 `bound_publisher_heartbeat_missing`，并伴随 ScienceDirect PII 页的 `capture_tab_job_mismatch`；CCS 也还是旧 2.2.39，文章页可正常加载并匹配 DOI，但结果仍为 `toc=not_found`。这些都还是 v7 的证据，不是 v9 的实测结果。

你现在只需要覆盖更新一次下面这一版，然后点击 **“立即开始任务（只补缺项）”**：

[更新 Tampermonkey 2.2.44 · Chem/RSC/CCS v9](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?journalfix=20261004-v9)

下一轮我按真实日志验收。最低验收条件是日志出现 `publisherMediaRevision=20261004-rsc-elsevier-ccs-v9`；Chem 要进一步确认不再出现 `capture_tab_job_mismatch / bound_publisher_heartbeat_missing`，CCS 要看到 `ccs_toc_index` 扫描，并在命中时出现 `ccs_toc_index_key_image`。在这些新回执出现之前，我不会再针对旧 v7 日志重复改适配器。
