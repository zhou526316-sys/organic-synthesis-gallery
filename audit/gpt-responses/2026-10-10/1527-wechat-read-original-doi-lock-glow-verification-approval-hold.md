# 2026-10-10 15:27+08:00 · 公众号阅读原文 DOI 深链与光效缺失（只读核实；待用户批准）

## 用户反馈
“我发现公众号的阅读原文点进去之后并没有锁定当前的精选文献，也没有光效。”

## 只读核实：已确认的代码事实（main `986358b64b33386c48f1134723c5b988c7beb80b` 基线）
- `audit/wechat-publisher/latest.json`: 2026-10-10 公众号首篇 `content_source_url=https://gallery.gczhouwld.com/?edition=2026-10-10`;没有 Angew DOI `10.1002/anie.3306470`。
- `ops/wechat-publisher/create-draft.py`：daily_article 的 `source_url` 基于 `?edition=YYYY-MM-DD`；retro_article 的 `content_source_url` 使用 `retro.source_url`。
- `public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json`：往期精选 `source_url=https://gallery.gczhouwld.com/?doi=10.1038%2Fs44160-026-01128-y`。
- `src/main.ts`：`loadEditionManifest()`只读取 `featuredDoi` 和非空 `dois`，否则立即 `return null`。然而 `public/wechat-editions/2026-10-10.json` 实际使用 `featured`，且没有 `dois`，因此此版合同不兼容，本期精选不会被正确标记。
- `src/card-share.ts`：仅从 `?doi=` 取精确目标。`?edition=` 无 doi 时无法触发 `shared-card-target`。高亮相关样式本来存在于 `src/card-share.css`，但只在 `?doi=` 找到卡片后激活，20 s 后清除。`deepLinkSummaryRequested()` 当前只要有 doi 且 `summary !== 0` 就打开摘要；老往期 `?doi` 链接默认可能被弹层遮住定位效果。
- `src/main.ts` 中 `filteredPapers()` 优先执行 edition DOI 排序，再执行分享 DOI 排序；对 `?edition=...&doi=...` 混合参数需要考虑分页与优先级。
- 尚未进行实际手机微信客户端复现；以上属于可直接由仓库代码与正式草稿回执支持的确定缺陷和疑似次要体验原因。
- 项目 `PROJECT_RULES.md` 第 23–31 行规定：反馈先核实，报告修复建议、影响面和风险；未经用户对该项反馈明确批准，禁止修改修复代码或部署。本轮严格按此执行，只写此审计记录，没有修改 production、没有修改公众号草稿、没有新增发稿任务。

## 拟议修复，等待用户决定
1. 今日精选“阅读原文”传递当天 + 精确 DOI，例如 `https://gallery.gczhouwld.com/?edition=2026-10-10&doi=10.1002%2Fanie.3306470&summary=0`；往期精选采用 `?doi=10.1038%2Fs44160-026-01128-y&summary=0`。单独的“今日全部文献”二维码继续保持 `?edition=2026-10-10`，不改变查看23篇的入口。
2. Gallery 兼容 `featured`/`featuredDoi` 两套字段，并在旧 `?edition` 无 doi 链接自动定位精选卡片、展示清晰稳定的高亮光效，以兼容可能已发送的旧公众号链接。
3. 混合 `?doi` + `?edition` 目标 DOI 永远优先、换页/重绘不丢失，光效对手机、低性能模式、减少动态效果偏好均可见。
4. 经桌面+移动端 DOM/实际浏览器验收后，**仅当用户批准**，再同步原 10 月 10 日双篇草稿的“阅读原文”链接到相同 media ID，执行 `draft/update` 和 `draft/get`；不动 DOI、文章正文、配图和封面，不群发。

## 给用户的拟定完整答复（含已发送的前段）
已经查到两个明确问题：
1. **公众号今日精选的「阅读原文」只指向日期页**，例如 `?edition=2026-10-10`，没有携带 Angew 的 DOI，因此网站不知道应该锁定哪篇文献。
2. **网站的日期页解析格式与公众号实际保存的数据不一致**：前端读取 `featuredDoi`，而公众号编辑清单使用 `featured`。这导致日期页的精选识别逻辑失效，原本设计的高亮边框也没有正常应用。

现有网站其实已经有 DOI 定位和卡片光效代码，所以不需要重新设计整套界面。修复重点是打通链接、数据格式与定位过程，并确保手机端分页不会让目标卡片消失。

此外，往期精选虽然已经带 DOI，但旧链接可能触发默认的摘要弹层，削弱了卡片本身的光效可见性；这一点仍需移动端确认。

建议同时修复：每日精选“阅读原文”直接携带 DOI 和日期；往期精选 DOI 链接只定位卡片、不自动弹摘要；Gallery 对旧日期链接自动识别精选并显示醒目光效，兼容已发送的历史推文。当天完整23篇文献的二维码入口保持不变。修复范围还包括分页、异步加载和手机端验收。不会更改任何文献、正文、封面或群发状态。

**这是新反馈项，我先按你此前规定完成了核实，尚未修改生产代码。是否批准按这套方案修复网站，并同步更新10月10日原公众号草稿？**
