# Cloud-offline fully automatic acquisition architecture

Beijing time: 2026-10-04 16:55 +08:00  
Context: Organic Synthesis Gallery — fully automatic TOC/body/full-text/PDF acquisition with the user's main PC powered off.

可以。要满足“我的电脑完全关机，系统仍然自动抓取”的要求，生产架构必须彻底去掉对你个人电脑和 Tampermonkey 前台浏览器的依赖。我的建议是把现有链路升级成 **云端控制面 + 常驻云抓取机 + 私有对象存储 + 自动发布/微信流水线**。

这里要区分两个问题：**硬件依赖可以 100% 消除**；**订阅全文/PDF 是否能永久零人工登录**，取决于学校的授权方式。如果学校 VPN / 机构登录允许长期会话或自动重连，那么整条链可以做到长期无人值守；如果学校强制周期性 MFA、扫码或设备重新认证，那只能在认证到期时人工续一次，不能也不应该绕过。公开页面和开放获取内容则可以真正 24/7 无人值守。

我建议直接采用下面这套生产架构：

1. **GitHub / Cloudflare 只做控制面，不直接承担所有抓取。** 继续保留现在的 07:05/17:05 审核、08:00/18:00 正式上线机制。每个正式进入 production 的 DOI 自动写入统一 acquisition queue，不再靠人工点击“立即开始任务”。

2. **建立一台常驻云 Windows 抓取机。** 可以用 Azure、阿里云、腾讯云等真正的 VM；系统里安装 Chrome/Edge、Playwright、学校允许的 VPN/aTrust 或机构代理。它 24 小时在线，并注册成 GitHub self-hosted runner/独立 collector daemon。GitHub 官方明确支持 self-hosted runner 部署在云虚拟机，而且运行环境不必每次任务后销毁。你的主电脑以后关机完全没有影响。

3. **抓取分三层自动降级。** 第一层优先使用出版社正式 API/TDM、OA/公开资源；第二层用普通云浏览器抓公开 HTML、TOC、图和正文；只有前两层拿不到已授权内容时，第三层才把 DOI 交给“学校 VPN + 持久浏览器 profile”的云 VM。这样不会把所有期刊都变成脆弱的 DOM 爬虫。Wiley 已经提供正式 TDM API，并支持在授权条件下通过 API 下载 PDF；ACS 也提供机构远程认证方式。Cloudflare Browser Run 可以作为第二层，因为它支持持久浏览器 session，但它不能替代学校 VPN，因此不能作为订阅全文的唯一节点。

4. **每个 DOI 变成一个独立资产状态机。** 不再用“这篇抓完/没抓完”的粗粒度状态，而是分别记录 metadata、TOC、body figures、full text、PDF、summary、featured-review。典型状态是 accepted → queued → toc_done/body_done/text_done/pdf_done → verified → published。任何一个资产失败只重试这个资产，不暂停整个队列；403/429/登录失效进入退避和重新排队，其他 DOI 继续抓到底。

5. **正文图和 PDF 必须做 DOI 级绑定校验。** 抓取前后验证页面 canonical DOI、标题、期刊；每张图保存 source URL、DOM selector/caption、article DOI、SHA-256；禁止同一个异常图 hash 被错误分配给多篇无关 DOI。PDF 也保存 DOI/title/provenance/hash，再进入私有库。这样可以从结构上杜绝以前出现过的“正文图串到另一篇文章”问题。

6. **R2 分成 public 与 private 两个数据域。** TOC/允许公开的正文图和派生摘要走 public media；原始全文 Evidence、订阅 PDF、授权 cookie/profile 等绝不进 GitHub Pages。PDF 放入 private R2，例如按 DOI/hash 存储，网页只有你的管理员账号出现“原文 PDF”按钮；点击后由 Worker 验证你的身份并生成几十秒到几分钟有效的 signed URL。对普通注册用户根本不返回 PDF 地址。对于非 OA 的出版社全文，我同样建议作为 private Evidence 使用，只公开摘要/解读和出版社原文链接；是否允许公开图像/全文要按文章许可和机构协议判断。ACS 的公开政策也明确区分 OA 与订阅文章的公开再发布权限。

7. **全文抓取直接接现有 Evidence Packet/摘要系统。** 现在仓库已经有 encrypted Article Evidence Packet、R2 handoff 和每日摘要契约。云 collector 抓到 abstract/partial/full HTML 后直接生成 Evidence Packet，不再经过你电脑；摘要链随后自动消费。这样“全文抓取 → 摘要 → 精选判断”会真正闭环。

8. **微信变成当天最后一个自动阶段。** 18:00 发布完成后，系统汇总当天 08:00+18:00 新上线 DOI；按期刊优先级、方法学新颖性、合成价值、证据完整度等打分自动选出每日精选。只有抓到足够 Evidence 的文章才进入深度解读。随后自动生成“今日上新列表 + 精选文献深度解读 + 网站 DOI 跳转链接/卡片”，接入你已经存在的 WeChat Draft Publisher；通过内容完整性检查、封面检查和微信回读后自动发布。失败则只阻断微信发布，不回滚当天网站文献。

最终数据流会变成：

**Crossref/OpenAlex/Publisher → 语义审核 → 08/18 正式文献上线 → acquisition queue → API/TDM → 公共云浏览器 → 学校 VPN 云 VM → R2 资产验证 → TOC/正文图上线 + 私有全文/PDF → Evidence/摘要 → 每日精选 → 微信自动发布。**

这比“把 Tampermonkey 搬到云里”可靠得多。Tampermonkey 当前已经验证有效的 publisher-specific DOM 识别逻辑可以保留，但应逐步抽成 Playwright publisher adapters；Tampermonkey 最终降级为调试工具，而不再是生产系统必须打开的前台。

还有一个现实边界：要达到真正的 24/7 零人工，最关键的验收项不是 Playwright，而是**学校远程授权是否能在云 VM 中长期保持**。如果 aTrust/学校 VPN 允许云 VM 安装并自动重连，这就是首选方案；如果它强制物理校园设备、周期扫码或云服务器被拒绝，则最稳定的替代方案是在校园网放一台低功耗常开 mini PC/NAS 作为授权抓取节点。你的个人电脑仍然可以完全关机，但授权出口来自校园网络。

对你当前 Gallery，我建议最终目标不是“一个超级脚本”，而是一个统一 DOI Orchestrator 加多个 publisher adapters。控制面、状态机、R2、发布和微信全部云端；真正需要机构访问的抓取由一台常驻授权节点承担。这样才是可以长期维护的全自动链路。

Sources consulted:
- GitHub self-hosted runners: https://docs.github.com/en/actions/concepts/runners/self-hosted-runners
- Cloudflare Browser Run persistent sessions: https://developers.cloudflare.com/browser-run/features/reuse-sessions/
- Wiley TDM: https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining
- ACS remote access: https://pubs.acs.org/page/remoteaccess
- ACS sharing policy: https://pubs.acs.org/page/authors/sharing.htm
