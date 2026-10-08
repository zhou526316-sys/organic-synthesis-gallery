# 2026-10-08 WeChat fixed-IP API correction and R2 draft completion

Beijing time: 2026-10-08 afternoon
Context: User reminded assistant of existing Official Account API and requested actual same-draft update
Importer workflow: 37736574642
Publisher workflow: 37736738477
State: draft_update + draft/get ok; no public send

## User-visible final reply

你说得对。**我上一条说“不能写入公众号后台”是错误的**。此前已经配置了微信公众号 API 和固定 IP 中转服务，而且我们一直用这条通道写入并回读草稿。

我已经通过原有接口，把 **10 月 8 日的同一份双篇草稿更新成功**：

- **今日精选 JACS**（10.1021/jacs.6c14748）：封面保留顶部“今日精选·JACS”，改用深蓝背景，底部留出原生白色标题区；化学示意来自原始 TOC，不使用 AI 重新生成化学结构。
- **SI Fig. S3**：直接从原始 SI PDF 重新裁取，补全了此前缺失的上半组核磁谱、全部结构框及完整图注。
- **往期精选 Nature Catalysis**（10.1038/s41929-026-01602-y）：恢复为你昨天亲自确认的那张方形封面，使用原图字节，不再重做。

微信接口返回 **`draft_update` 成功、2 篇文章、`draft/get` 回读成功**，而且草稿 ID 与上一版相同。不是新建了另一份草稿。没有公开群发。

**[查看更新后的真实公众号草稿预览](https://relay.gczhouwld.com/wechat-preview/029c168fe848633a5072afac.html)**

素材完整性和本地叠字检查已经通过；手机订阅号助手自身的原生缩略图效果还需要以 App 实际显示为准。
