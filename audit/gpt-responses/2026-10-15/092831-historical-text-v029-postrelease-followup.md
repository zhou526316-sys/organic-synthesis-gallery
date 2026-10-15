# GPT response synchronization — historical fulltext 0.2.9 follow-up

- Beijing timestamp: 2026-10-15 09:28:31 (UTC+08:00)
- Task/context: Continue independent full-catalog historical text acquisition, v0.2.9 live deployment acceptance, and metadata-only diagnostics.
- GitHub PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/665
- Diagnostic-only merge: d20413edd20a5f3656b1fbdaf5daeeb3e87c0aac
- Cross-tab audit update: 79344813287a96d340ba1b1efd16451e06fcd2b9
- No new browser capture version, no public FTS enablement, no publisher rights relaxation.

## User-visible reply (partial and terminal portions, in sequence)

## 历史正文获取：10月15日续作结果

已承接 0.2.9 的部署与验收记录，并重新检查正式仓库 `zhou526316-sys/organic-synthesis-gallery` 的抓取逻辑。

本轮重新执行了[管理员只读诊断 #38663212945](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38663212945)，结果如下：

| 指标 | 实际结果 |
|---|---:|
| 最新诊断事件 | 200 条 |
| 独立论文抓取尝试 | 133 次 |
| 出版社脚本未确认启动 | 62 次 |
| 许可证未核实 | 41 次 |
| 实际 HTTP 403 | 21 次 |
| 科学正文不足 | 6 次 |
| 本机保存成功 | 1 次 |
| 0.2.9 实际浏览器回执 | **0 次** |

这些仍是 0.2.8 的旧记录，不能代表 0.2.9 的运行表现。

**当前最重要的判断是：许可证误判和出版社脚本未启动是两类不同问题。** 0.2.9 已处理前者的过早结束逻辑，但后者仍需单独验证。

为此已建立 [PR #665](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/665)，增加按出版社、失败原因及脚本版本交叉统计的只读诊断，不改变正式抓取行为。

## 新发现：失败原因高度集中于不同出版社

[新的交叉诊断 #38665655983](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38665655983) 已实际运行成功。

| 出版社 | 主要故障 | 次数 |
|---|---|---:|
| ACS | 出版社脚本未确认启动 | **57** |
| Wiley | 许可证未核实 | 20 |
| Nature | 许可证未核实 | 19 |
| RSC | 实际 HTTP 403 | 10 |

这意味着，在旧版的 62 次“脚本未确认启动”中，**57 次集中于 ACS**。因此接下来的修复优先级应调整为：

**先检查 ACS 的 DOI 跳转及 Tampermonkey 脚本注入，再处理 Wiley/Nature 的许可证识别问题。** RSC 的真实 403 则需要独立判断，不应靠增加重试强行突破。

这仍是 0.2.8 的历史样本，ACS 的具体根因尚未通过 0.2.9 的真实浏览器实验确认。

## 本轮交付与后续验收

PR #665 已通过仓库的站点质量、Tampermonkey 和私人 PDF 回归，合并至 `main`，提交为 `d20413e`。随后管理员只读诊断获得上述新的交叉统计结果，完整核查记录已更新至：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-15-v029-postrelease-readonly-recheck-and-publisher-breakdown.md

全库正文目前**不能称为已经抓齐**。2026年10月14日的已复核基线为 1087 个正式 DOI，其中 Europe PMC 来源有 47 篇 OA JATS 结构候选（31篇结构完整候选、16篇部分候选）；47篇中只有1篇完成双遍正文和许可证审核并受控导入6个科学章节，且公共全文检索仍未开放。其余46篇尚待正式审核。正式来源遍历、本机保存、章节完整、公共检索是四个不同层次；8篇和12篇是诊断样本，不是全局抓取上限。

当前应在实际采集浏览器中确认脚本版本 `0.2.9`：
https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
备用：https://api.gczhouwld.com/gallery-historical-text-pilot.user.js

刷新 Gallery 后先执行“出版社回执核验（最多8篇）”以对照 ACS 直达与 DOI 跳转，再执行“跨期刊正文证据核验（12篇）”核查 Wiley/Nature 许可加载，最后点击“立即上传待发诊断”。两类样本完成后，仍可使用“全库开放正文补抓（本机）”，该官方 OA 来源覆盖全部正式 DOI，不受 20 篇上限约束。已经存在于同一浏览器脚本 GM 存储中的管理员密钥无需重复输入。

新识别的三项采集逻辑变更仍待明确批准与进一步证据：ACS 无回执情况下的身份安全握手、OA 来源阴性结果的期限复核、已保存 `partial` 正文的安全升级。未修改 TOC、正文图、SI、PDF、每日北京时间08:00发行或公共 FTS 开关。本次没有发布新版本的 Tampermonkey 脚本；安装器仍为 `0.2.9`。
