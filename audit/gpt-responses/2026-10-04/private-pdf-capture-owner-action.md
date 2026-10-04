# Response synchronization

Context: Private PDF architecture rollout continued after connection interruption. Secret-bearing owner bootstrap URL is intentionally redacted from this public audit record.

## Final response

已经继续到一个安全可用的节点。

现在正式线上状态是：

- 私有 PDF 独立 R2：已上线；
- owner-only PDF 读取层：已上线；
- Tampermonkey PDF 抓取旁路：已上线；
- PDF 抓取开关：已开启；
- PDF 处理/激活：仍关闭；
- 普通账号：行为完全不变，仍跳出版社；
- TOC、正文图、全文文本、文献发布、08:00/18:00、公众号现有流程：未改；
- 部署覆盖问题：已修复，用户/支付维护工作流不能再用残缺配置覆盖正式 Worker；
- 线上健康检查：privatePdf bucket=true, readEnabled=true, captureEnabled=true, processingEnabled=false；
- 正式 Tampermonkey 安装包：2.2.41，已包含 private PDF capture side-channel。

用户下一步：
1. 覆盖更新正式 Tampermonkey 安装包。
2. 确保 Gallery 当前登录的是用户刚指定的目标账号。
3. 打开一次性 owner 绑定链接（本审计中已删去 claim code），核对页面显示账号后确认 owner。
4. 点击“授权本浏览器抓取 PDF（7 天）”。
5. 正常运行现有“立即开始任务（只补缺项）”；PDF 只作为旁路额外抓取，不影响原媒体任务成败。

重要边界：
- 当前抓到的 PDF 先以 raw/active=0 进入私有库；
- 因处理/激活仍关闭，所以这些 raw PDF 暂时不会改变“原文”按钮，也不会自动进入摘要、TOC/正文图或公众号；
- 下一阶段将以真实抓取样本实现并验收 PDF identity/version verification + EditorialEvidenceBundle；
- 只有 verified EditorialEvidenceBundle 才能进入每日公众号精选文章深读/写作证据池。

One-time owner setup link: [REDACTED — supplied only in the private chat response]
Tampermonkey online installer: https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?pdf=20261004-private-pdf-capture-v1
