# Gallery 搜索框自动填充账户邮箱：只读核实与审批待定

北京时间：2026-10-17 19:43:29
上下文：网站搜索/登录冲突改善的接续反馈。用户截图表明，每次刷新后文献搜索框自动出现账户邮箱，导致全库搜索0篇。本文不记录实际邮箱字符串，避免在公共审计日志中复制个人标识。

## 核实证据
- PR #734 已合并。main 中 src/main.ts 把 query 初始化为空；搜索框 type=search、name=gallery-literature-search、autocomplete=off、data-lpignore=true。未发现这里将登录邮箱主动设置为文献查询。
- src/user-ui/search-controller.ts 的 start() 采用 preservedQuery || searchInput.value || ''，onInput 再从搜索框 value 更新查询并派发 gallery-corpus-query。因此只要浏览器/扩展先将邮箱放进搜索值，它就可能被网站接纳为搜索词。
- 旧 PR 仅断言用户键入 LMCT 不重建真正的密码框以及 search autocomplete=off；并未覆盖页面刷新后浏览器把账号名称自动填到搜索框的情况。
- 截图证实关键词误填和被应用搜索。可能是浏览器密码管理器/表单恢复，但没有浏览器内部事件或网络 trace，不能证明唯一原因，也不能推断异常登录/泄密。
- Worker 资源发布 run #39028811901 已成功；Pages run #39028807338 核查时仍 in_progress，故不能断言截图来自所有新前端部署完成的版本。

## 拟议修补（本轮待明确批准）
- 保留用户中心正常密码管理器/邮箱自动填充，只在文献搜索框进行受控状态恢复与自动填充隔离，不能全站停用密码保存。
- 搜索初始化不要采信非用户发起的账号邮件自动填充；兼容正常键入、粘贴、中文输入法、站内搜索跳转、DOI深链。
- Playwright 增加 Chromium 类环境的注入/刷新搜索-登录回归，确保自动填邮箱不执行搜索请求、正常搜索与登录正常。浏览器原生密码管理器行为仍需真机验收。

## 用户可见核实结论
截图里的0篇不表示文献丢失。网站搜索值原本应为空，但 browser autofill/form restore 可能改写搜索框；现有控制器会接纳输入值并当成关键词，因此旧补丁没有完整封住这条路径。建议补丁仅保护文献检索输入，同时不影响正常邮箱/密码登录；按反馈先核实、批准后修的项目规则，未在本轮擅自改动代码或生产环境。

参考 PR: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/734
源码: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/user-ui/search-controller.ts
源码: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/src/main.ts
发布: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028807338
发布: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/39028811901
