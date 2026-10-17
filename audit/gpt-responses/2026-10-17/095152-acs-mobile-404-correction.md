# Gallery ACS mobile “打开原文” 404: correction and diagnosis

Beijing time: 2026-10-17 09:51:52
Context: user clarified that the ACS short link also ends in 404 after the website's successful security verification.

## Correction to previous answer
- Withdraw prior claim that the ACS short link works. User meant security verification succeeded, NOT article access.
- Both the Crossref-registered ACS long URL and the ACS /doi/10.1021/jacs.6c17862 short URL yield 404 on this mobile connection after verification.
- The earlier proposed blanket rewrite of ACS links to the short path is not a validated remedy; do not implement or deploy.

## Confirmed facts
- Crossref shows DOI 10.1021/jacs.6c17862, JACS title Enantioselective Coupling of Unactivated Alkenes with α-Imino Esters via Alkylzirconium Radical Intermediates, dated 2026-10-16. Crossref resource.primary.URL is the user-provided long /jacsat/article/doi/... path.
- ACS official announcement https://pubs.acs.org/page/platform-transition-plans says publication platform migrated to Silverchair on 2026-07-24, with features requiring fixes after launch.
- Remote independent ACS access checks were challenged as bot_blocked. Therefore cannot prove server-side cause or reproduce mobile 404 with same session.
- Independent web index identifies https://pubs.acs.org/jacsat/article/doi/10.1021/jacs.6c14748/5445706/Stereoselective-1-2-Metalate-Rearrangement-of as a valid 2026-10-07 JACS article; can be used as a comparison.
- Current Gallery main source src/main.ts calls shared/publisher-article-link.mjs for “打开原文”, DOI link and PDF fallback. The helper currently returns doi.org for ACS, not direct ACS. That is not proven to be the fault.
- Read-only diagnosis; existing project feedback approval gate prohibits changes without explicit approval.

## Exact user-visible partial replies
这个信息改变了之前的判断。

**既然 ACS 短链接通过安全验证后仍然返回 404，那么问题就不只是 DOI 长链接失效。**

目前更可疑的是 ACS 的网站访问控制：手机访问时先触发安全验证，验证成功后，出版社服务器仍然返回 404。

这也意味着我之前提出的“将 Gallery 全部 ACS 链接改成短链接”并不能解决问题，**该修改方案暂时撤回，不应上线。**

进一步查到一个重要背景：ACS 官方确认，**2026 年 7 月 24 日，ACS Publications 已整体迁移至 Silverchair 新平台**。迁移后部分功能曾需要修复。来源：https://pubs.acs.org/page/platform-transition-plans

结合你提供的现象，目前有两种主要可能：

1. **单篇论文的发布同步问题**：这篇 JACS 论文 10 月 16 日刚登记，DOI 已存在，但 ACS 新平台的文章页面可能尚未完全同步。
2. **ACS 的访问控制或移动端问题**：安全验证虽然成功，但后续请求仍无法正确进入文章页面。

现有证据尚不能确定是哪一种。

## Planned final user-visible response
我找到一个适合排除故障范围的对照：这篇 10 月 7 日已上线的 JACS 论文 https://pubs.acs.org/doi/10.1021/jacs.6c14748 。

请在同一手机网络下点开一次：

- **旧论文能够打开，只有 10 月 16 日的新论文 404**：更符合 ACS 对新论文的发布同步或单篇路由故障。
- **两篇都在验证之后 404**：更符合该手机浏览器/网络环境触发 ACS 访问控制或迁移后平台兼容问题。

目前没有证据证明 Gallery 的按钮生成了错误 DOI，也没有证据证明校园网是必要条件。我不会把短链接修复当作已解决，更不会据此修改全站 ACS 链接。若所有 ACS 文章持续 404，可以向 ACS 官方支持 support@services.acs.org 报告 DOI、访问时间、验证后 404 截图；这是其官方公布的支持渠道。

**这篇 10 月 7 日的 JACS，在同一部手机上是否也返回 404？**
