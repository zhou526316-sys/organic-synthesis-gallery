# WeChat editorial rules consolidation

Beijing time: 2026-10-07 17:12 +08:00
Context: consolidate reusable editorial rules from recent Official Account production
Functional commit: b7dc557d9bf56c7af6804bcac231a7cf3e7e4a1f

## Assistant final reply

已经沉淀，而且这次不是只做“经验总结”，而是把它变成了以后公众号制作的默认生产协议。

我已经把规则同时写入 **项目全局规则、公众号编辑合同、可复用 Skill、提示词库**，并新增了一份专门的《WeChat Editorial Production Playbook》。功能性提交是 `b7dc557`。以后即使换一个项目聊天窗口接手公众号工作，也会先读取这套规则，不再依赖当前窗口里的临时记忆。

以后每篇“今日精选 / 往期精选”默认按这一套走：

1. **先深读，后写稿。** 主文、SI、已有深读记录、Peer Review（有则读）先形成一个内部 editorial plan，固定包含 core question、30 秒结果、真正瓶颈、设计逻辑、evidence matrix、figure map、失败边界和 background gate。
2. **教材式背景默认删除。** 面向有机化学科研读者，普通氧化/还原淬灭、SET 定义等基础知识不再单独展开。只有背景会直接改变对本文证据或机制的理解时才保留。
3. **全文围绕一个核心科学问题推进。** 顺序是“做成了什么 → 为什么难 → 作者改变了什么 → 为什么可能有效 → 决定性证据 → 能证明到哪一步 → 替代解释 → 失败边界 → 合成意义”。禁止“后续 Fig.4/Fig.5 很重要”“非常巧妙”这类没有实际信息的句子。
4. **图片不再后补，而是在写稿前就完成 figure map。** 主文图优先；关键正文图原则上不能因为排版方便而漏掉。每张图只承担一个主要论证任务，正文必须明确写原文 Fig./Table/SI 编号。除开篇核心反应图允许“先图后文”外，全文统一“解释文字 → 图片 → 图注”。
5. **多面板大图按论证拆分。** 但不能裁掉结构、坐标、箭头、条件、图例或关键 panel；SI 图只用于补机制、控制、失败边界、时间进程等主文没有充分展示的内容，不用 SI 图挤掉正文图。
6. **机理措辞按证据等级写。** 内部分为 observed / supports / compatible / computation / author model / unresolved。以后“观察到”“支持”“与……相容”“作者提出”“尚不能排除”都有明确边界，不会再把模型或相关性写成“证明”。
7. **scope 不再写成报菜名。** 必须同时告诉读者哪些化学空间真正扩展了、哪些需要换条件、哪些失败，以及这些失败说明了什么边界。
8. **制作流程改成批量完成后一次写入微信。** 先完成 editorial plan → text-only → images-only → 独立审核 → 合成，然后一轮 revision 只触发一次 draft/update，最后用 draft/get 回读检查两篇文章顺序、封面、390/690 px 图文、图号、裁图和缺图。这样能明显减少之前反复改一句就重新生成草稿的低效循环。

另外我把一份“发布前 90 秒检查”也写进 Playbook，包括：有没有教材式背景、每个关键因果句是否有证据、主文关键图是否齐全、图号是否明确、图文顺序是否统一、scope 是否写失败边界、是否存在过度机理结论、手机端图片是否可读等。

这套规则现在已经是项目级默认规则。后续你只需要告诉我“今天精选哪篇 / 往期精选哪篇”，正常情况下不应该再需要反复提醒这些基础制作要求。

规则文件：`docs/wechat-editorial-production-playbook.md`
