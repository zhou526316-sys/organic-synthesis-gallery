---
name: literature-gallery-wechat-automation
description: 从零搭建并运营“文献发现 → AI审核 → Gallery网站 → 媒体抓取 → 微信公众号草稿”的个人自动化系统。
version: 1.0.0
language: zh-CN
---

# Literature Gallery + WeChat Automation Skill

## 目标
帮助个人用户建立一个长期可维护、可审计、可恢复的科研内容流水线：
1. 自动发现候选论文；
2. AI 证据化审核 include / exclude / pending；
3. GitHub 版本化与固定时段发布网站；
4. 可选的 TOC / 正文图 / 全文 / 私有 PDF Browser Bridge；
5. AI 深读、中文写稿、公众号真实草稿；
6. 发布前 QA、审计、失败恢复。

优先级：正确性 > 可审计性 > 可恢复性 > 自动化率。

## 安全边界
- 不要求用户把 AppSecret、API Secret、PAT、Cookie、学校账号或 VPN 密码贴到聊天。
- Secret 只能保存在平台 Secrets、系统凭据库或本地 .env；.env 必须 gitignore。
- 不绕过付费墙、CAPTCHA、DRM、401/403/429 或机构授权。
- Browser Bridge 只复用用户本来有权访问的浏览器会话。
- 公众号默认先做到“自动生成真实草稿 + 人工最终发送”；只有用户明确授权且账号真实支持发布接口后，才考虑自动发布。
- 证据不足时必须 pending；不得把推测写成事实。

## 第一次接手必须先做
生成 SETUP_STATUS.md，逐项盘点：
A. 目标：研究范围、目标期刊、回溯范围、更新频率、网站公开性、是否要公众号、是否需要机构全文。
B. 账号：GitHub、域名、Cloudflare、微信公众号、学校/机构 VPN、可选云 Windows。
C. 本机：Git、Node.js LTS、Python 3.11+、Chrome/Edge、Tampermonkey、编辑器、可选 Wrangler。
D. 权限：仓库 push、Actions、Pages、DNS、R2/Worker、微信 AppID/AppSecret、草稿接口、发布接口。

环境没确认前，不要直接做“全自动群发”。

## 推荐架构
~~~
Metadata sources
  ├─ Crossref
  ├─ OpenAlex
  └─ publisher sources
        ↓
Candidate DOI union + dedupe
        ↓
AI semantic review
  include / exclude / pending
        ↓
Git audit + staging
        ↓
fixed release gate
        ↓
public Gallery
        ↓
media gap queue → browser/VPN Bridge → object storage
        ↓
editorial evidence bundle
        ↓
AI WeChat article + QA
        ↓
WeChat draft
        ↓
manual final send by default
~~~

## 阶段 1：最小仓库
AI 负责建立 public、data、docs、audit、scripts、.github/workflows、shared 等目录。
最少需要：
- PROJECT_RULES.md
- docs/literature-scope-contract.md
- docs/literature-update-protocol.md
- audit/literature-update-state.json
- shared/literature-journals.js

先做最小网站，再加复杂能力。

## 阶段 2：候选发现
不要用关键词直接决定收录。
候选优先使用多来源并集，例如 Crossref online/published/created、OpenAlex、可访问的出版社 TOC/ASAP/Early View。
流程：按 ISSN/日期请求 → 合并 → DOI normalize → 去重 → 对比已审核集合 → fresh candidate handoff。
建议：最近 2–3 天做主语义审核，约 7 天做机器安全尾扫，并保留晚注册 DOI 救援。

## 阶段 3：双遍语义审核
每篇候选必须保存：
DOI、title、journal、evidence、first decision/reason、challenge decision/reason、final decision、pending nextAction。
第二遍必须主动尝试推翻第一遍，检查标题偏见、文章类型、主要贡献、正文隐藏方法学以及证据是否足够。
证据不足就 pending。

## 阶段 4：发布状态机
至少定义：
idle / fetching / reviewing / ready_to_publish / ready_with_pending / syncing / synced / sync_failed / needs_approval / blocked_by_concurrent_change。
新任务先读状态。新鲜锁存在则禁止重复抓取。已完成抓取只差部署则不得重抓。
一个 pending 默认不阻塞其他已完成证据化审核的 include。
正式发布前机器校验；发布后核对线上 DOI 集合，不以 CI 绿灯代替真实上线验收。

## 阶段 5：媒体 Browser Bridge
只有公开 API/HTML 无法稳定提供媒体时才引入。
队列只发送缺项：missing_toc / missing_body_figures / missing_fulltext / missing_pdf_owner_copy。
Bridge 要求：复用授权浏览器；单 DOI 失败跳过；幂等；lease/heartbeat；失败分类；不猜 PDF URL；保存 DOI、source URL、page URL、label/caption、SHA256 等证据。

## 阶段 6：私有 PDF
PDF 与公开媒体严格分离。
PDF 默认 owner-only，不进入公开 GitHub Pages，不公开对象 key。
只有 DOI/标题/作者身份验证通过的文档才能进入 Editorial Evidence Bundle。
化学结构与反应图优先来自论文真实图，不用 AI 重画冒充原图。

## 阶段 7：公众号编辑
默认分成“今日更新”和用户确认的“精选深读”。
深读顺序：
30 秒看懂结果 → 为什么难 → 真正瓶颈 → 设计逻辑 → 决定性实验 → 证据能证明到哪里 → 替代解释 → 失败边界 → 合成意义。
正文中文优先；缩写首次出现解释。
图片只使用论文/补充信息真实图片或明确标注的概念示意图。

## 阶段 8：公众号 API
先能力探测：
1. AppID + AppSecret 换 access_token；
2. 上传正文图片；
3. 上传封面得到 thumb_media_id；
4. draft/add 创建草稿；
5. draft/get 回读并 QA；
6. 用户明确授权且账号支持时才尝试 freepublish/submit；
7. 轮询发布状态并写 receipt。
access_token 不是长期 Secret，应按平台有效期刷新。

## 阶段 9：QA
网站：DOI 集合、重复、日期/期刊、资源 URL、移动端、生产数据一致性。
公众号：文章数量/顺序、精选 DOI、中文术语、图片重复、裁切、图文对应、机理证据等级、封面小卡裁切。
必须以 draft/get 回读结果作为草稿验收对象。

## 阶段 10：纠错沉淀
用户指出错误时：
验证 → 根因/影响 → 需要时请求业务批准 → 修复 → 增加测试/规则/审计 → 真实线上验证。
禁止只改单个数据点后结束。

## 每阶段标准报告
向用户报告：
- AI 做了什么；
- 用户还要做什么；
- 当前自动化状态；
- 缺少哪些权限；
- 下一步；
- 风险与恢复办法；
- 真实产物链接。

## 完成定义
不是“脚本能跑”就完成。至少做到：
规则可读、数据可追溯、发布可审计、失败可恢复、Secret 不进 Git、AI/人工责任清楚、网站真实可用、公众号至少稳定生成可验收真实草稿。
