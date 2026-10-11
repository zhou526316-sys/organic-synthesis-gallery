# 2026-10-11 北京时间 · 公众号长期草稿规则统一及新窗口交接

## 用户需求
“我发现新的公众号窗口并没有完全承接记忆。它的草稿生成规则全是错误的。你来制定一份规则给他。并作为长期公众号草稿生成的规则。”

## 已落实

建立并核实 \`main\` 上的现行唯一规则：
- **主规范**：\`docs/wechat-editorial-master-rules.md\`，commit \`e7b99c67031f0cf1bdd3f0cdeb9d6fd7ebac3364\`。
- **全项目强制入口**：\`PROJECT_RULES.md\`，commit \`5251e82a9156cffbdbfedec2efd7f0611d59f33b\`。
- **修复冲突合同**：\`docs/wechat-editorial-contract.md\`，commit \`8808b870e321c588652f8873589de022a5edaf4c\`。
- **修复冲突操作手册**：\`docs/wechat-editorial-production-playbook.md\`，commit \`63953d44af852cebf7e6bc90afe2605d86503a30\`。
- **完善独立文字/图片/微信回读门禁**：\`docs/wechat-draft-editorial-gate.md\`，commit \`7898166d15d270fb0e56bd6ea2677a1788e483c1\`。
- **自动化防回退校验**：\`scripts/test-wechat-editorial-master-contract.mjs\` commit \`e75516d416c2b6f8e7d47895cb7b4943bfb2b332\`，CI \`.github/workflows/wechat-editorial-master-guard.yml\` commit \`a796f060e2541f84153adf9ffa246adc44f26b8c\`。CI run [#38110727131](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38110727131) **success**。
- 所有规则文件的主规范链接已在线二次读取确认，过时的“今日精选标题只写论文题目”**不再是默认规则**。

## 主规范锁定重点

1. 当前用户指示优先，但长期规则被明示改动之前不能凭旧案例/新窗口猜测替换；必须先读 PROJECT_RULES、主规范、合同、playbook、gate 与最新草稿。
2. 两篇独立微信图文：今日精选第 1、往期精选第 2，选题只由用户定，Gallery 08:00 唯一正式文献批次；当天新增 >5 只列期刊数量。
3. **今日精选原生完整标题** \`有机合成文献日报｜MM.DD｜今日精选｜期刊：忠实自然的中文题目\`；封面不额外增加“今日精选·JACS”顶部条，最大化原始 TOC，留足且不浪费深色标题承托区。
4. 往期精选按正确作者/中文标题，方形概念封面简约贴合论文，不采用固定圆圈/气泡套路；关键结构只可原文抠图且逐像素核验，已获用户批准的封面不擅自重画或更换。
5. 研究级由浅入深的因果论证，尊重证据等级与局限，中文自然去 AI 味，不机械译词、不堆浮夸评价。
6. 逐张主文/SI 图片完整性与段落位置：Fig.4B 不许被错置到结语；Fig.5e 镍催化机制不能截掉节点；跨两页 SI Table S11 必须完整两页；不得生成式重画实验分子结构/谱图/数值。
7. **阅读原文**必须精确 DOI、\`summary=0\`，Gallery 到对应卡片约 20 秒动态蓝色光效，不自动弹摘要；独立保留当天全部文献二维码。
8. 固定流程：源文+SI -> 单页编辑计划 -> text-only 与 images-only 独立自审+哈希门禁 -> 一次微信真实 draft/add 或同 media_id draft/update -> draft/get 严格回读 -> 真实预览与自审；草稿权限永不代表群发权限。
9. 当前 10 月 11 日草稿未由本项“规则文档更新”任务改动；新的窗口应按主规范独立检查/修复自己先前的违规草稿，不得以文档更新替代真实微信稿件验收。

## 对用户的交付

长期主规范：
https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/docs/wechat-editorial-master-rules.md

可转发新窗口的开场指令：
“你现在承接 Organic Synthesis Gallery / 化之岛公众号正式制作工作。必须先完整读取 main 上 PROJECT_RULES.md、docs/wechat-editorial-master-rules.md、docs/wechat-editorial-contract.md、docs/wechat-editorial-production-playbook.md、docs/wechat-draft-editorial-gate.md，并核对当前选定 DOI、正文/SI、当日正式更新及微信草稿真实回读。以 Oct11 主规范为唯一现行编辑基线，不沿用过时的仅论文标题、固定气泡封面、截断 SI 图片或未回写草稿就交付的旧规则。按用户当前选择制作独立今日精选+往期精选、科学严谨中文深读、完整原图、精确 DOI 阅读原文及约20秒蓝色高亮。先 text/image 双审核，再同一草稿一次 draft/update、draft/get、自审、发真实预览；不得群发。用户已明确确认的封面和正文不擅自推翻。”

本任务属于**规则长期化及跨窗口交接**，不是草稿内容修改或群发，不声称当前微信草稿已因此改变。
