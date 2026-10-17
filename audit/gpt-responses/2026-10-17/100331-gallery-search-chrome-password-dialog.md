# Gallery 搜索触发 Chrome 保存密码弹窗：诊断记录
北京时间：2026-10-17 10:03:31
来源：当前项目会话用户截图，搜索 lmct 后 Chrome 原生弹出“要保存密码吗？”并把 lmct 当用户名。
状态：只核查，没有修改前端、用户信息、浏览器设置或生产部署；按 PROJECT_RULES.md 需要先批准反馈修复。

## 已核查证据
- 截图显示的是 Google 密码管理器的 Chrome 原生“要保存密码吗？”弹窗，而非 Gallery 自己的登录界面。
- 弹窗的用户名=lmct，是当前文献检索词；说明 Chrome 的账户字段识别出现混淆。
- `src/main.ts` 中第 991 行 mount() 用 app.innerHTML 重建整个主页面，第 992 行 mountUserShell 会重新创建用户中心与搜索控制器。检索路径在成功/回退后调用 mount()，如 loadIndexedViewPage() 和 refreshArchitectureCorpus()。
- `src/user-shell.ts` mountUserShell 销毁旧 UserSearchController 并重新创建 GalleryUserShell。
- `src/user-ui/library-shell.ts` GalleryUserShell 的 shadow DOM 只在用户中心打开时装入真实的邮箱/密码登录表单，输入含 autocomplete=current-password 与密码表单提交监听。
- `src/user-ui/search-controller.ts` onInput 将搜索词透过 gallery-corpus-query 转给检索处理，不是登录接口调用；不能从截图推断网站真的执行了登录或泄露密码。
- 页面重建与登录字段/浏览器密码管理器的关联是合理解释，但没有取得实际 Chrome 密码管理器内部事件，不能宣称已经完全复现或确定唯一根因。
- 截图同时显示“摘要索引连接暂不可用...临时匹配”，4 篇只是回退结果，不是全库完备搜索。

## 拟修复范围（未批准）
1. 搜索输入明确标记为文献搜索（autocomplete=off, aria-label, name 等），避免浏览器把搜索文本解释成账号。
2. 搜索完成时不要整体重建 app 和认证相关 Shadow DOM；仅替换结果区域并保留搜索框及已登录的用户中心实例。
3. 增加自动化浏览器回归：搜索不触发登录表单提交、无密码表单创建/卸载、保留用户中心状态；检查响应速度和索引失败降级。
4. 不修改真实的账号登录/自动填充使用体验，不直接关闭全站密码保存。

## 用户可见回复
这不是 Gallery 的登录框，而是 Chrome 浏览器自带的 Google 密码管理器弹窗。截图中“用户名”被识别成 lmct，恰好是检索词。请点“不用了”，不要保存这条错误记录。
核查代码发现，搜索完成后的 mount() 会重建整个页面和用户中心；用户中心包含真正的邮箱/密码输入，Chrome 有可能将页面重建和此前的密码输入错误关联。这是有源码依据的疑似原因，尚未浏览器复现证明。
搜索本身不需要登录，当前没有看到搜索请求会调用密码登录接口的证据。截图中的 4 篇也只是摘要索引不可用时的标题元数据临时结果，并不是完整全库结果。
建议明确将搜索框排除账号自动填充，并把搜索刷新改为只更新结果区而不是整体重建用户中心，增加 Playwright 回归。鉴于反馈修复需用户批准，当前没有修改或上线。
如用户同意，回复“批准修复搜索触发密码弹窗”，再实施与验证。
