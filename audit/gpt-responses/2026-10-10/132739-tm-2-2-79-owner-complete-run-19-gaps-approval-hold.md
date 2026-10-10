# Tampermonkey 2.2.79 新上传真实日志：完整运行的 19 个未补齐 DOI

北京时间：2026-10-10 13:27:39（对话：抓取有机合成文献并持续更新网页 / Tampermonkey 接续）
状态：**只读核查与待审批方案，未修改生产采集代码、PDF 权限和生产图片，未宣称公开网页的暂存正文图已经发布。**
来源：owner 于 2026-10-10 13:22:30 北京时间上传的 R2 本地诊断（uploadedAt=1791609750163）。GitHub 只读取证工作流 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38027355737 及定向源码安全跟踪 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38027464620。只读脚本在尚未合并的 PR #459 审计分支上更新，未触及生产 Tampermonkey 源码。

## 用户可见结果正文

**2.2.79 已经真正投入运行，原先 34 篇连带冷却显著改善。** 这次从北京时间 11:17:42 至 13:04:37 完成 33 篇实际出版社访问、37 次尝试，14 篇确认补齐，19 篇仍未补齐（其中 13 篇 RSC、4 篇 Chem、2 篇 ACS），最终冷却 0、待执行 0、访问受阻 19。获得 12 张新主图的存储回执、63 张正文图暂存回执、28 篇全文证据。**暂存不等于已在网站发布**。

| 剩余分类 | 数量 | 经日志核验的主要原因 |
|---|---:|---|
| Chemical Science + Green Chemistry (RSC) | 13 | 已访问出版社页面，均显示 TOC = not_found、正文图 0/0，多篇全文文本已存；并非未派发 |
| Chem (Elsevier) | 4 | 对应出版社页面 `publisher_access_gate`；私人 PDF 尚未存储 |
| JOC + Organic Letters (ACS) | 2 | JOC 已发现候选但 TOC 下载/清晰度不达标；OL 图片已采集而 PDF HTTP403 |
| 合计 | 19 | 不应笼统显示为“出版社受阻” |

**TOC 待补 14 篇：Chemical Science 8、Green Chemistry 5、JOC 1。** **私人 PDF 经最终完整库存核实仅 7 篇确实缺失：Chem 4、Chemical Science 2、Organic Letters 1**，另 12 篇是待验证状态，不可计入已存或缺失。最新一轮 PDF 库存读取 **228/228** 完成：209 ready / 12 pending / 7 missing / 0 unknown。此前 175/228、53 未知、126 秒读取失败是运行中途的瞬时快照，已经由最终的 38.4 秒成功复核纠正。但全文文本库存本次仍出现约18秒网络超时并沿用缓存，需要进一步完善。

**RSC 需解决源发现能力，而不是进一步冷却。** 针对 `10.1039/d6sc06407h`，真正调用过官方 Silverchair AJAX，但是返回 `semanticImages=0;accepted=0`，回退搜索出现 `access_denied`。`10.1039/d6gc03161g` 等多篇正文成功读取、图片扫描多次仍为 none；出现的 `pdf.gif` 等 PDF 首页预览被正确拒绝为 TOC，这是应保留的真实性保护。源码 AJAX 回退仍只针对两篇 DOI 硬编码，下一步需要根据真实 DOI/文章 ArticleId、官方媒体元数据和访问回执识别资源；不能简单扩大白名单就称已解决。对于经合法授权、DOI 验证的 PDF，可以研究识别真正带标签的 Figure 1 作为替代主图；PDF 第一页截图绝不能伪装官方 TOC。

**ACS 应做局部恢复，不必重新抓已保存图片。** `10.1021/acs.joc.6c01847` 的 `toc_filter_summary=found`，但官方主图 `page_fetch=failed`，一项候选只有 520×71 像素、图像质量不足；正文图已有 4/4 存储回执，不能假定 TOC 已存。另一个 `10.1021/acs.orglett.6c03915` 的 TOC、9 张正文图与全文证据都已完成，只有私人 PDF 请求明确返回 403；不得将其当作图片缺失、也不得无视授权限制重复请求。

**Chem 的四篇 DOI** `10.1016/j.chempr.2026.103008`、`103043`、`103220`、`103282` 均记录访问验证阻断。应分别核对真实授权与页面路径，遵守登录与 HTTP 403，不绕过权限限制或凭猜测标记 PDF stored。

**建议审批的后续三项：** A. 优先针对 13 篇 RSC 建立 DOI＋ArticleId 严格验证的多路径主图/正文图真实发现，以及许可内的真实 Figure 1 回退；B. 针对 JOC 单篇做高质量 TOC 候选下载/回执修复，针对 Chem 和余下 PDF 单独分类授权失败（不再重复已有图片）；C. 完善文本库存超时续读和暂存→正式审核发布的逐 DOI 核对，并让前端将“缺图、访问验证、PDF403、上传失败”分开显示。上述为**待用户批准**的定向方案，不能把此次已读日志当成变更授权。

## 完整 DOI 清单与证据映射（补充）

RSC Chemical Science 8:
- 10.1039/d6sc06407h
- 10.1039/d6sc03717h
- 10.1039/d6sc05761f
- 10.1039/d6sc06374h
- 10.1039/d6sc05829a
- 10.1039/d6sc06573b
- 10.1039/d6sc06421c
- 10.1039/d6sc06246f

RSC Green Chemistry 5:
- 10.1039/d6gc04458a
- 10.1039/d6gc05783g
- 10.1039/d6gc04087j
- 10.1039/d6gc04772f
- 10.1039/d6gc03161g

Chem 4:
- 10.1016/j.chempr.2026.103008
- 10.1016/j.chempr.2026.103043
- 10.1016/j.chempr.2026.103220
- 10.1016/j.chempr.2026.103282

ACS 2:
- 10.1021/acs.joc.6c01847
- 10.1021/acs.orglett.6c03915

区分数据层次：33 个独立 DOI；37 次尝试；summary.success14、failed4、partial19 为**尝试事件统计**，不能与独立 DOI 的 14 success／15 partial／4 failed 直接混同。剩余19是最新逐 DOI 状态 15 partial+4 failed。服务器已暂存的图片不代表网页可见。资料来自用户的 owner-private 上传经仅输出白名单指标的只读取证，不保存密钥/授权头/图片和原始诊断全文。

固定范围仍是 addedDate>=2026-10-01，文献唯一正式发布时间仍为北京时间08:00；未更改。
