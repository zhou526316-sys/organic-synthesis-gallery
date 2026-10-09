# Tampermonkey owner 2.2.73 日志验收、跨版本比较与 Chem 定向修复
北京时间：2026-10-09 08:39（项目聊天“继续 Tampermonkey，新日志已上传”）
审计证据：audit/tampermonkey/2026-10-09-0824-owner-bridge273-diagnostic.json
代码草稿：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/424
状态：正式安装包仍为 2.2.73；PR #424 在独立分支，尚未合并或上线。

## 已发送的用户可见部分（基本原文）
已读取今天 08:24 上传的新日志。确认运行的是 VPN Bridge 2.2.73 / TOC 引擎 6.2.54，说明新版已经正确安装并执行抓取任务。

日志上传时间：2026 年 10 月 9 日 08:24:16（北京时间）
- PDF 已确认保存：174 / 177。
- PDF 确认缺失：3；PDF 未知：0。
- 本轮仍未补齐：15；其中缺 TOC：13。
- 本轮尝试 18，出版社任务访问 16，正文图新暂存 6；本轮完全补齐 1。这是本轮统计，并非全站仅 1 篇完整。
- 相比上一份快照，PDF 已确认保存数从 154 增为 174，未知库存从 12 降为 0；不能断言这些新增存储全部直接由某一版脚本造成。

新日志确认的剩余故障：
- OL 10.1021/acs.orglett.6c03611：原 TOC 已有、正文图 4/4 已暂存、私人 PDF 已保存，无需重复抓取。
- JOC 10.1021/acs.joc.6c01847：正文图 4/4 暂存，但官方 TOC 未找到，私人 PDF 已存在。
- Chemical Science / Green Chemistry：12 篇左右的 Silverchair 原始页面只有 PDF 缩略预览、找不到可验证的图形摘要或图号，程序正确拒绝把 PDF 页面缩略图冒充 TOC。
- Chem 10.1016/j.chempr.2026.103220、10.1016/j.chempr.2026.103282：`page_doi_unverified` 后出现重复 `controller_timeout`，需在不验证 DOI 的情况下快速终止当前绑定任务并继续后续 DOI。
- Chemical Science 10.1039/d6sc03717h：出版社原文 PDF 抓取实际 HTTP403，不能靠上传重试冒充已获取，也不得绕过授权。

今天 08:00 的文献增量已复核：
- 2026-10-08 截止的目标范围 177 篇；
- 2026-10-09 08:00 新增 28 篇；
- 当前 2026-10-01+ 累计 205 篇；全站目录 915 篇。
上传动作发生 08:24，但原抓取运行 00:46–01:50，**今天的新 28 篇尚不在这次日志验收内**，不应该把“仍缺 15”当作最新 205 篇的整个队列缺项。

PDF 原图恢复入口在正式网页真实可见：https://gallery.gczhouwld.com/pdf/?doi=10.1039%2Fd6gc04458a&rescue=1 ，该 DOI 的私人 PDF 已经保存；需 owner 登录权限。入口“从 PDF 找图”用于 DOI 核验、Figure/Scheme 页码定位、原页裁切导出与人工复核；未审核和未确认出版许可的图片不能自动公开。

## 在本轮执行的代码修复
- PR #424 草稿，分支 fix/tm-chem-doi-binding-timeout-20261009。
- Elsevier/Chem 有真实绑定且已超过现有 DOI grace 校验仍无 DOI 时，写入与 jobId 绑定的最终“failed attempt”回执，结束控制器等待、继续下一篇，不把 TOC/PDF 判为不存在。保留过期任务、跨 DOI、暂停状态的拒绝规则。
- 读取得到的 Crossref DOI 主要资源已验证两篇 Chem 真实 PII：103220 对应 S245192942600286X；103282 对应 S2451929426003487。只在原始 DOI 跳转无法抵达出版社时，用 exact Crossref DOI + exact Elsevier linkinghub host + 校验后的 PII 导向现有 ScienceDirect 文章路由；不造图 URL、不绕过登录，公开网络对相关文章页仍提示 bot_blocked。
- 新增本地模拟回归覆盖任务 currentness、正确/错误 DOI、Crossref 元数据是否匹配、重试与证据保护；在最后一次检查时，相关 CI 仍在排队。本轮**未升级、未部署新的正式 2.2.74 安装包**。
- 正式版保持现有可用的 VPN Bridge 2.2.73（https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js），不能给未经上线的测试脚本链接。
- 现有稳态 08:00 唯一正式文献发布规则不变，不修改 public literature records、不新增付费、不公开 owner PDF。

## 面向用户终稿（计划发送）
已经核实 2.2.73 的实际改进：PDF 库存达到 174/177、0 未知，OL/JOC 正文图链路已具备成功入库凭证。剩余 15 项主要是 12 篇 RSC 缺可用原图、两篇 Chem 页面对不上 DOI、1 篇 JOC 官方 TOC 缺项；3 篇私人 PDF 尚缺。RSC 的正确路径是从已授权 PDF 中生成带 DOI/页码溯源的原图候选并审核，不能把 PDF 缩略首页错收。Chem 的 DOI-PII 官方元数据恢复与失败任务提前结束修复已提交 PR #424，正在回归，尚未上线，不要求再次安装。今天 08:00 新增 28 篇没有被本次 01:50 结束的日志覆盖，刷新 Gallery 后下一轮任务必须以 205 篇准入范围验收。