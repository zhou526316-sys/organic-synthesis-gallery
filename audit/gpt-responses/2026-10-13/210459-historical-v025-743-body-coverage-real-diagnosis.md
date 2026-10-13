# 0.2.5 历史正文采集截图和最新私有诊断 — 只读核验

- 北京时间：2026-10-13 21:04:59 Asia/Shanghai
- 仓库：zhou526316-sys/organic-synthesis-gallery
- 对话：用户提供0.2.5历史正文覆盖界面，询问/反馈743篇实际正文质量、527项复查及索引建设。
- 仅新建 GitHub audit/automation-triggers/historical-text-diagnostic-read.json 触发已有管理员只读汇总，提交 SHA 356a4c36e5573acb782f66ba6a937871b9dccc2b；没有对采集、权限、媒体或目录生产代码做修复。
- 实际只读工作流：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38401474230
- 本记录不含任何管理员密钥、Cookie、出版社原始全文、PDF或私有事件ID。

## 第一条已发送的用户可见回复摘要
这张截图反映历史正文大量访问但保存量很低，应该优先解决实际成功率，而不是继续扩大访问数量。
用户截图：正式984 DOI，已核实日期的历史743；本机已有科学正文67（约9.0%），没有确认正文676（约91.0%）；许可证待核实588，科学正文不足46，访问/身份受阻27，暂时故障15，从未访问0。
743=67+588+46+27+15。当前批次7/527，是512新版解析可复查候选和其他可重试项组成的本轮工作范围，不等于历史母数。最初七篇中四篇许可证未核实、其他受阻三篇、保存零。

## 第二条已发送的用户可见回复摘要
管理员私有只读日志 #38401474230 查询最近200条诊断事件，归并128个真实DOI+jobId尝试（128最终结果，0仅检查点，0终结重复，记录仍有下一页）。
跨版本样本：ACS117、Nature6、Wiley2、Science3；许可不明60、超时55、页面HTTP错误7（实证403）、正文不足6；HTTP200共66、403共7、未知55。
版本标记事件：v0.2.5=31，v0.2.4=142，旧标记0.2.2=27（旧0.2.3曾错误标记0.2.2）。每次任务可能有多条事件，不可把31当31篇。
其中有最终结果的v0.2.5真实独立尝试16次：许可证未核实11、实证403共3、科学正文不足1、超时1、本机成功0。不是整个527批次的最终结果，不能以16次推断全库成功率。

## 当前main源码确认
public/gallery-historical-text-pilot.user.js v0.2.5 的 batchLicenseEvidence 只接受文章专属CC BY3/4或CC0，先于gather正文识别执行。因许可证待核实，甚至不能知道该文网页里科学正文是否可用；许可未证明不等于订阅限制，也不等于不能阅读，588需要拆因。
batchArticlePageReady 仅依据h2/h3/h4/p存在，gather按相关选择器抽取，遇到期刊动态DOM或异构标记可能漏掉正文。保存门槛为 Results/Mechanism/Experimental至少250字符并经hash落盘，不是完整章节验收。因此截图67只意味着达到当前低限的本地文本包，不等于67篇完整全文。
batchCoverageSummary 读取IndexedDB attempts/packets快照，普通一键开始时按保存结果及retry资格过滤出 selected.length。这里527不等于所有743，运行中点击前取得的覆盖快照可能未同步刷新。
浏览器IndexedDB文本仍不自动进入Gallery公共全文FTS。HTTP403既有实际证据，不能靠无限访问和盲目延时解决；不要将合法私有阅读权假设为任意复制或公开传播权。

## 拟发送的最终建议 / 待用户批准
当前527批次已表现出连续失败，建议管理员暂时在本机点击暂停，保留已有67份已存文本和诊断，避免对出版社反复无收益访问。
拟按三项精准修复继续：1. DOI级分离来源是否可访问、正文科学结构可得性、本文真实许可证、仅私人处理或允许公开索引的权利；优先从正式出版社或真正开放许可的可信来源获取学术正文，记录证据，不绕过403/身份验证。2. 对主要出版社分别适配真实科学正文DOM及章节质量验收，核验 Results/Scope/Mechanism/Experimental/Scheme/Figure/Table，而不凭250字宣布全文完整；先用10—20篇授权真实样本验收。3. 依DOI/section/hash和版权范围建立隔离的章节级FTS；合法共享全文才能进入公共检索，其他能合法私用的正文考虑本地私人检索，全部正式DOI持续由标题/作者/摘要进入公共检索。
本轮按照PROJECT_RULES.md用户反馈先核实再批准原则，未修改采集器或服务器正文索引；如明确批准再独立提交PR、回归、部署和真实召回验收。

## 关联文件及文献
- 当前 main 脚本 https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/public/gallery-historical-text-pilot.user.js
- 历史正文版权/本机隔离约束 https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/historical-text-search-pilot.md
- 之前0.2.5合并 PR #610: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/610
