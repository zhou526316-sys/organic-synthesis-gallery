# User-visible response — Gallery PDF Range 206 and rule-based Ghelper proxy diagnostics

Beijing time: 2026-10-10 09:12:29
Conversation context: Organic Synthesis Gallery PDF slow/unreadable, user provided DevTools screenshot, Edge campus network with Ghelper rule-based U.S. proxy node, on/off cannot load either healthcheck URL.
Source audit: audit/pdf-reader/2026-10-10-campus-edge-ghelper-range-206-readonly-diagnosis.json.
Privacy: no actual token query, Cookie, Authorization, HAR or public IP stored.
Read-only actions: reviewed main source, fetched unauthenticated public health for canonical and backup Cloudflare API; both returned ok:true externally.
Production changes in this turn: none, awaiting user feedback approval.

## Previously sent user-visible partial

这次基本可以排除“PDF 权限不足”作为主要原因了。

**关键证据有三点：**

1. 三条 PDF 请求都收到 `206`，说明服务器已经开始响应；但 **206 不代表整段 PDF 数据传输完成**。
2. 两条请求正好在约 **9 秒**结束，另一条在 **12 秒**结束，分别对应阅读器配置的预取和首次分段超时。
3. 我从另一条外部网络复测了两个公开 API 地址，均正常返回 `"ok":true`，响应约 **0.26 秒**。但你在校园网中，无论开关 Ghelper 都无法正常打开它们。

由此判断，**最值得怀疑的是校园网／代理到 Cloudflare 的数据传输路径**：响应头能到达，PDF 数据流却可能很慢或中途停住。不能仅凭这些证据断言 Ghelper 就是唯一原因。

此外，正式版仍一次预取最多 1 MiB 的 PDF 分段，按 9 秒超时处理。在你的网络上，这个策略可能过于激进。缩小首屏请求、观察实际收到的字节数，比继续延长超时更有意义。

## User-visible completion

你提供的网络信息已经足够了，**不需要再提供学校名称、公网 IP、校园网账号或 VPN 配置**。

现在能确认：Gallery 页面和 PDF 文件接口的可达性并不相同；你的 Edge 已收到 PDF 接口的 206 响应，但后续数据没有在 9～12 秒的预算内可靠完成。截图的“大小”列显示约 180 kB、257 B 和 591 B，但仅凭这些数字还不能确认对应的 `Content-Range` 长度及实际完整性。

**有一个最有效的对照测试：**如果 Ghelper 支持“全局代理”，请暂时保持校园网和同一个美国节点不变，把“规则代理”切成“全局代理”，然后只测试一次 [主 API 健康接口](https://api.gczhouwld.com/api/_healthcheck) 和同一篇 PDF。测完再切回规则模式，不必修改 Windows 系统代理或学校 VPN。如果全局模式能打开，说明 Ghelper 的按域名分流很可能存在问题；如果仍然失败，就更应怀疑美国节点链路或两条 Cloudflare 路径自身在该网络下不稳定。

**我建议下一轮代码修复分两部分：**先把 PDF 首屏的 1 MiB 预取改为适应慢网络的小分段（例如 128～256 KiB），在页面中明确区分“收到 206 响应头”和“已完整收到该分段”，并记录脱敏的实际下载进度、超时及备用线路切换结果；随后完成腾讯独立入口的 TLS 和真实校园网验收。目前腾讯入口仍停留在草稿状态，没有启用，因此现有两条 Cloudflare 路径并不是真正独立的网络备援。

上述小分段方案可能提高慢网络下第一页的成功率，但会增加分段请求次数；如果两条 Cloudflare 路径都不可达，则它也不能保证打开。

**是否批准先实施“自适应小分段 + 真实传输进度与失败原因诊断”，保持现有权限校验和连续滚动不变？** 此前已合并的代码我不会未经确认就再次修改。
