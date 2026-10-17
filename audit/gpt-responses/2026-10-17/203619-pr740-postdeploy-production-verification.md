# PR #740：部署完成后的生产验证与 Edge 复测待办

北京时间：2026-10-17 20:36:19
会话：gallary网页运营 / 继续核实搜索框自动误填账户邮箱的修复。

## 本轮给用户可见回复的完整核心内容
PR #740 的 GitHub Pages、Cloudflare Worker、前端同步验证和正式全库检索都已成功。三个发布执行均以合并提交 b6612bf6e7dad3888d5ea655674a08f964ecdf94 为 head SHA。
GitHub Pages run #39031587676 completed/success；Worker run #39031592794 completed/success；前端同步 run #39031587677 completed/success。它的验收输出 ok:true，涵盖 GitHub Pages、Worker、api.gczhouwld.com 和 gallery.gczhouwld.com 四个站点，各扫描21个JS chunk，且 customShareCard:true。
最新线上全库搜索验收 run #39032527288 completed/success；live-search-readonly、live-browser-readonly (390) 与 live-browser-readonly (1280) 全成功。正式目录1337篇；LMCT匹配13篇，手性磷酸22篇，轴手性40篇。浏览器验收里所有查询返回HTTP 200；移动390px和桌面1280px的错误列表均为空。手动查询有用户发起的读取型GET；验收中记录 blockedMutations 为8和10，验证只读执行。
因此上线成功、搜索可用性与已有回归测试均获得证据。但 Chrome/Edge 原生密码管理器对用户个人保存的账号的自动填充无法在普通GHA无该浏览器账户的环境下完整复现。不可向用户宣称已百分之百证明连续刷新不再填充账户邮箱。
建议用户在原 Edge 正常配置打开 https://gallery.gczhouwld.com/，先 Ctrl+Shift+R 强制刷新，再连续刷新3至5次，检查搜索框不会出现登录邮箱；手动搜索 LMCT 和 DOI；确认用户中心仍正常登录。如仍误填，复测期间不要删除账号或密码记录，保留截图/操作结果进行针对性诊断。

## 链接
https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/740
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39031587676
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39031592794
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39031587677
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39032527288

本轮为只读核验及审计记录；未修改应用逻辑、生产数据库、浏览器账号状态或原有发布调度。