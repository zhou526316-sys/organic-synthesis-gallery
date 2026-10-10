# 2026-10-10 20:39 Asia/Shanghai — LMCT 全库搜索续修与生产验收

Chat context: “现在搜lmct还是只有4篇” → 查明正式页面 DOM 有 11 张而可见 4 张（7 张被 UserSearchController 错误隐藏） → PR #490 上线 → 用户“继续”，本轮进一步修复连续搜索的跨域网络失败。

## 本轮用户可见结果（应与本轮消息对应）

> PR #490 已完成正式部署，LMCT 旧的 4 篇漏显问题已修复。生产浏览器桌面和手机查询 LMCT 均显示 11 张卡片，旧的 7 张错误隐藏未再出现。

> 新增的跨域读取修复 PR #496 已合并至 main，提交为 c0328953a22ae1bf4df4b56e296bfc2d4aeb3c85。Worker 优先提供简单 CORS GET 检索，保留旧 POST 兼容；前端通过 api.gczhouwld.com 优先、workers.dev 备用，必要时回落 POST。单独参数与 CORS 路径测试已通过；这不修改收录/审核/摘要/TOC/图/PDF/用户数据。

> 实际生产 GET 已完成只读验证：LMCT matched=11,count=11；手性磷酸 matched=11,count=11；轴手性 matched=25,count=25。GET 接口不经过 JSON POST 的 OPTIONS 预检。

> 此前 [Gallery live acceptance #38050057174](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38050057174) 在 GET 页面部署前执行，前四个词实际通过、第五个“轴手性”浏览器 POST 连续 net::ERR_FAILED；它不能代表新版本已通过全部浏览器验收。2026-10-10 20:39 Beijing Worker 部署 #38052280394 成功，Pages #38052280399 仍在执行整站预发（Hot/Archive 测试通过，目前 PDF 读取与权限验收）。最终 GET 浏览器连续查询回归尚待新 Pages 真正发布后检验。

## 已执行写入 / 提交

1. PR [#496](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/496) 已合并：c0328953a22ae1bf4df4b56e296bfc2d4aeb3c85。
2. Worker 增加 `GET /api/literature/catalog-view`；`cloudflare/worker/src/literature-catalog-get-query.js` 严格接受已知的目录 ID、查询、日期、期刊数组和游标，界定长度/字段/期刊数量，不扩大权限。原 POST 路径保持。
3. 前端 `src/platform-api.ts` 产生有界 GET URL，优先简单 GET 两个公网路由，在中间件不支持时回退兼容 POST；本地 preview 行为不变。
4. `cloudflare/worker/scripts/test-literature-catalog-get-query.mjs` 覆盖 Unicode 词与过滤器、游标及异常 URL；Worker CI/部署门禁纳入测试。
5. `scripts/verify-gallery-search-browser.mjs` 支持记录 GET/POST 与真实 DOI 可见性；`gallery-search-live-acceptance.yml` 仅对已上线正式网站做浏览器检查，避免 PR 阶段拿旧网站构建当成修复版验收。
6. Cloudflare migration CI #38052166659 通过；Site quality gate #38052166627 通过；Worker 生产部署 #38052280394 完成。
7. 本轮使用公共 GET 只读接口核验，未申请私人 PDF、未调用浏览器账号会话，未提交任何脱离 08:00 发布槽的文献或媒体新增。

## 限制

- 当前正式发布 DOI 约 938 篇，仅指本期经审核文献档案，不等同目标 15 刊创刊以来完整历史论文。
- 页面软件仍可能因缓存或未完成的新 Pages 发布暂未使用 GET；不应对最终生产连搜成功作无证据承诺。
- 用户只需在正式 Pages 更新后刷新主站搜索，无须手动数据库操作。首次刷新可用 Ctrl+Shift+R。
