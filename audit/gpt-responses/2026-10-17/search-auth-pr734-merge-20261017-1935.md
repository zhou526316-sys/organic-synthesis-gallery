# 搜索与登录界面冲突：授权修复合并与部署核查

北京时间：2026-10-17 19:30:23
会话：项目 gallary网页运营，用户先要求核实“搜索功能与登录界面有影响”，本轮明确回复“可以”，同意继续实施此前核实的 PR #734 搜索优化与登录表单隔离。

## 本轮实施
- 从先前 PR #734 的 30 项改动承接：搜索输入和账户 DOM 稳定，Chrome 密码保存误判规避，D1 搜索性能优化，静态 Hot+Archive 1337 文献日期分页，搜索结果可信状态，回归测试。
- 并行团队 main 已单独完成的 D1 FTS finalize 优化（Worker 源码与测试文件内容 SHA 与 PR 分支一致）不重复覆写。
- 在主分支快照 425d0121 上，以 Git 合并提交 748984f1190aeb48f8ab6cf7fac854c30c49bbf8 将旧分支移植整合；PR #734 最终合并提交 78019e0a300fce509145e55f37f6a689d6574c31。
- 最终 30/30 GitHub PR 检查通过（包括既有 Playwright 交互回归、WebKit/Chromium、搜索建议、分页、Worker 测试）；一项图片生命周期测试首次 WebKit CORS 失败，经独立无代码重跑通过。未关闭或削弱任何断言。
- 已确认独立正式全库搜索生产验收 #39024920749 通过：1337 DOI，LMCT 13，手性磷酸22，轴手性40；桌面1280/手机390线上浏览器通过。这是新 PR 上线之前的生产索引验收，不宣称新前端已经验收。

## 部署状态（记录时）
- Pages 发布 run #39028807338 进行中。
- Worker 前端发布 run #39028811901 进行中。
- frontend-worker-sync run #39028807319 失败：刚 workflow_dispatch 完即执行 gh run watch，GitHub API 子任务列表返回暂时 HTTP 404；独立 Worker deploy 已经启动，不能将同步器失败误报成 Worker 部署失败。
- 需要分别以 Pages/Worker 最终结果与实际网站读回为准，未完成前不可声称线上已修。
- 未更改每日08:00文献发布、文献身份、账号密码、私人PDF/媒体、Tampermonkey 工作流。

## 对用户可见回复要点（已发送的分段内容）
已在原 #734 分支完成与新 main 的整合，旧 hotfix 不重覆；所有30项 PR CI 通过；合并 PR #734 成功；独立生产 D1 索引/搜索验收正常；现处于正式 Pages 和 Worker 部署阶段，不提前宣告线上完成。以上包含本轮事实与留待部署确认的边界。

相关链接：
- https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/734
- https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/78019e0a300fce509145e55f37f6a689d6574c31
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028362959
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39024920749
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028807338
- https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028811901
