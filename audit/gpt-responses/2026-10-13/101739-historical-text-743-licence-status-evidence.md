# 历史正文 0.2.2：用户浏览器 6/743 失败截图、CC BY 漏判风险，只读核验

- 北京时间：2026-10-13 10:17:39（Asia/Shanghai）
- 任务：抓取有机合成文献并持续更新网页 / 独立历史正文一键补抓
- 用户输入：截图 image(20261013-021306).png，Gallery「历史正文 · 独立补抓」状态
- 截图可见：运行中；已尝试 6/743；本机新增 0；已存在 40；无权限/无许可 5，其他受阻 1；当前阶段 license；当前/最近 DOI `10.1126/science.aec6298`；本地错误“未核实本文许可”；诊断“未配置密钥（仅本机）·待发12”
- 本轮仅核对 live GitHub main/脚本与书目公开来源；**未修改生产脚本、任务队列、用户浏览器、权限或云端状态**，不自动将截图误解为用户批准新修复。
- GitHub main 只读核查时 SHA `16b980dbb4c422f25242546601886f2914681bd7`；`public/gallery-historical-text-pilot.user.js` SHA `4f6e6e59eaab02ba0d3d24acac1d90c7d7f65716`，@version 0.2.2。
- 该脚本的 `batchLicenseEvidence` 仅接受出版社页面上明确 `https?/creativecommons.org/licenses/by/{3.0,4.0}` 或 `CC0` 的文章级声明。不是强制“用户账户无权访问”的检测，而是文本提取后的再利用许可审核。网页许可标记缺失、尚未渲染、许可展示在不同 DOM 结构、处于页面访问拦截状态，都可能落入 `license_not_verified`。
- 许可检查发生在 pageDoi 精确匹配之后，脚本从 i=0 循环每次延迟700ms，i>=2 时无候选直接 `license_not_verified`，因此约 1.4 秒（不含页面加载）就可能因尚未出现许可节点做出早期结论。失败记录默认在下一轮“一键补抓”时跳过，需要主动使用“复查受阻项”；这并不意味着已实质断定文章无授权。
- `已存在40` 由 IndexedDB 的 `packets.getAllKeys()` 大小赋值，可能是历史存量，并不代表本轮新增，也不能从截图断言40条每一篇都在当前743候选。
- `待发12` 为本机待发送的诊断事件数，预计可有 checkpoint 与 final 两类，不能当作失败文献数量。未配置单独的历史脚本 Bridge 管理员密钥时不发服务器；要在当前浏览器「配置诊断上报」中自行填写，**不要放在聊天/文件/日志中**。历史诊断上报仅固定枚举元数据，不是任何正文/PDF/图片上传。
- 截图“当前阶段/当前最近 DOI”是正在进行/最近选择的 DOI，而“本地错误”字段可以是前一篇已结束的状态：截图不能证明 `10.1126/science.aec6298` 已经以 `license_not_verified` 结束。应按「失败详情」里的 DOI + status/时间核对。
- 该 Science DOI 在 Crossref 真实元数据：Title `Catalytic Appel fluorination of alcohols with potassium fluoride`；2026-07-30；Crossref 响应本轮没有可用于授权的 `license` 字段。Crossref API https://api.crossref.org/works/10.1126/science.aec6298
- OpenAlex 真实元数据（同 DOI）：`primary_location.license=cc-by`、`primary_location.version=publishedVersion`、`open_access.is_oa=true`、`open_access.oa_status=hybrid`、`has_content.grobid_xml=false`。OpenAlex API https://api.openalex.org/works/https://doi.org/10.1126/science.aec6298 。这是合理怀疑“脚本网页授权识别假阴性”的线索，但数据库许可标记不等于已完成全文版本授权的独立核验，更不能由此擅自上传/公开受限全文。
- 对 DOI 正式出版社站点进行只读检索尝试：web `https://www.science.org/doi/10.1126/science.aec6298` 403，TinyFish 同一 DOI science.org / spj / doi.org 返回 bot_blocked。**云端访问受阻不能证明用户 Edge/Chrome 浏览器也受阻**。勿将外部 403 冒充本机 HTTP。
- 项目规则 `PROJECT_RULES.md` 明确“反馈先核实，我决定”：截图属于尚未授权的新许可判定与 UI 优化反馈，本轮只读核验，给出用户手上立即可操作的排查，不直接写生产修复代码。

## 本次可见回答（含阶段性内容与终结方向）

“这张截图显示了什么？”
已尝试 6/743，本轮新增正文 0，本机已有40。本轮5篇许可待核验，1篇其他受阻。不是6篇无全文，也不是VPN一定无访问权限。当前 DOI 10.1126/science.aec6298，阶段 license。0.2.2 仅核对 CC BY 3.0/4.0 或 CC0 的页面授权。待发12是诊断事件，而非12篇论文，未配置密钥尚未上传。

“找到了一个值得重点排查的许可识别问题”
Science 论文 `Catalytic Appel fluorination of alcohols with potassium fluoride`，2026-07-30。OpenAlex DOI 元数据指示 `hybrid` `cc-by` `grobid_xml=false`，出版方页面外部访问被阻，不足确认用户现场真正访问结果。脚本只核出版页面版权声明，存在false negative风险。截图当前 DOI 与前一篇错误提示不一定为同一篇最终结果。

建议立即：暂停批量进程，避免对未确认许可的大量 DOI 无效访问与待发诊断积压；在 Gallery 点击「失败详情」查看6篇的逐 DOI状态；在本机「配置诊断上报」填写历史脚本独立的现有 Bridge 写入密钥、等回执后看「服务器报告」，12条待发减少之前不称已上传。不要把密钥截图/复制进聊天。等待真实失败列表后可按出版社区分DOM/载入延迟/出版社许可/访问限制。已存40不等同本轮新增，不直接说40/743都覆盖。

更深核验：历史脚本 i>=2 在 2次700ms轮询后未找到CC许可证就记录 `license_not_verified`，一些出版方异步页面极易过早假阴性。这种状态被普通后续一键任务跳过，需要「复查受阻项」。建议下一步单独修正：科学正文页面和授权分支分别核查，出版商授权 DOM/开放许可来源交叉印证且不得凭 OpenAlex 单独授权公开正文；区分 `license_missing_in_dom`、`publisher_restricted`、`page_not_ready`、`licensed_but_not_loaded`；按网络实际状态分类有界重试、保留 0.2.2 逐 DOI诊断回执，全部独立，不碰 TOC/正文图/PDF。此为新反馈，**须用户批准才实施**。

注意任何补抓属于用户当前浏览器的合法文本本地试验，不得擅自把付费全文上传到公开库或借学校VPN当成服务器再利用授权。
