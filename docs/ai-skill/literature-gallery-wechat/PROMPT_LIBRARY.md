# 给 AI 的提示词库

## P0 接管新项目
~~~
你负责帮我搭建“文献自动发现 + AI审核 + 网页展示 + 公众号草稿”的长期项目。

研究范围：<范围>
目标期刊：<列表>
正式发布时间：<例如每天北京时间08:00>
网站：GitHub Pages + <自定义域/暂时不用>
公众号：<需要/暂时不需要>
机构全文：<需要学校VPN / 不需要>

要求：
1. 先做环境与账号能力盘点，不要先写大段代码。
2. 所有规则、状态、审计写进 Git。
3. 每阶段告诉我“我做什么 / 你做什么 / 验收 / 回滚”。
4. 不要让我把任何 Secret、Token、Cookie、密码贴在聊天。
5. 先做最小闭环，再增加媒体与公众号。
~~~

## P1 最小 Gallery
~~~
请在 GitHub 仓库 <owner/repo> 建立最小可用文献 Gallery。
卡片至少包含 DOI、英文标题、中文标题、期刊、日期、原文链接、审核状态。
要求 GitHub Pages 可打开、手机端优先、数据与 UI 分离，并预留 TOC/正文图/摘要。
添加 README、PROJECT_RULES、状态文件和恢复说明。完成后给真实在线链接并自行做移动端验收。
~~~

## P2 范围契约
~~~
请建立 literature-scope-contract。
不要用标题关键词、产物数量或“是有机分子”直接决定收录。
为 <研究范围> 定义 include / exclude / pending 的文章级证据标准，列出最容易误判的边界类型，并设计第一遍判断 + 第二遍挑战审核。写入仓库后，所有新论文都必须遵守。
~~~

## P3 候选发现
~~~
为 <期刊列表> 建立每日候选发现。
用多个独立来源并集，至少考虑 Crossref online/published/created 与 OpenAlex。
要求 DOI normalize、去重、3天主窗口、7天机器安全尾扫、晚注册救援、fresh handoff。
抓取失败不能被解释成“没有新论文”；候选任务不能直接改生产网站。
~~~

## P4 双遍审核
~~~
读取 fresh handoff，严格按 scope contract 做两遍审核。
每篇输出 DOI / evidence / first decision+reason / challenge decision+reason / final include|exclude|pending / pending nextAction。
第二遍必须尝试推翻第一遍。证据不足就 pending，不靠标题或想象补全。
~~~

## P5 固定发布
~~~
把候选发现、AI审核、生产发布拆开。生产只允许在 <时间> 发布。
一篇 pending 不阻塞其他已完成证据化审核的 include。
增加状态机、并发锁、prepublish validator、线上 DOI-set verification、receipt，以及失败时 fail closed/下一槽恢复。
~~~

## P6 Browser Bridge
~~~
部分出版社需要我自己的学校VPN/机构登录。不要绕过登录或反爬。
设计 Tampermonkey Bridge：队列只列缺 TOC/正文图/全文的 DOI；优先今天新增；从真实 DOM 提取；单篇失败跳过；lease/heartbeat/去重；上传对象存储；保存 DOI、source URL、page URL、label/caption、hash；不猜 PDF URL；不把 Cookie/密码写入 Git。告诉我首次需要手动做哪些操作。
~~~

## P7 公众号草稿
~~~
只基于今天已经正式发布到 Gallery 的文献写公众号。
今日精选 DOI：<DOI>。
精选先读主文和 SI；证据不足就停止深度机理写作。
正文中文优先；图片只使用论文/SI真实图片或明确标注的概念示意图，绝不把 AI 重画结构冒充原图。
完成后做科学事实、术语、图片重复、裁切、图文对应、封面小卡 QA。
~~~

## P8 接公众号 API
~~~
先做我的公众号接口能力探测，不要直接群发。
我会自己在微信后台获得 AppID/AppSecret 并放进安全 Secrets；你只告诉我变量名和保存位置。
顺序：access_token → 图片/封面上传 → draft/add → draft/get → update/delete 测试 → 最后单独检查 freepublish 权限。
先做到真实草稿稳定生成。没有我的明确批准，不启用自动群发。
~~~

## P9 修问题
~~~
问题：<描述>
请先复现并核实，再说明根因、影响范围和风险；需要业务决定时先给选择；修复后必须增加自动测试/规则/审计，最后验证真实线上结果。不要只改单个数据点。
~~~
