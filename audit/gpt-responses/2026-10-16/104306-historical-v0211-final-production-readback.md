# Response synchronization — Continue historical text v0.2.11 production acceptance

- Beijing timestamp: 2026-10-16 10:43:06 +08:00
- Context: The user said “继续” after PR #711 merged, when Pages deployment #38837156601 had still been running. This turn verified completed Pages, production userscript and latest owner-only diagnostics. No new capture or publication code modified.
- Prior merge: `8e3e669d4e629aef949ff620300501098fa59de7`.
- This turn's evidence/audit record: `5ec455ff72caf2af5d40a0ae259316c3158e1661`.

## Complete user-visible answer, including partial responses

## 历史正文 0.2.11：正式部署已成功

刚刚重新核对 [Pages 部署 #38837156601](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38837156601)，三项任务全部成功：

| 部署阶段 | 结果 |
|---|---|
| 文献发布授权 | 通过 |
| 站点构建 | 通过 |
| Pages 正式部署 | 通过 |

[PR #711](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/711) 已合并，正式仓库 `main` 中的历史正文脚本版本为 `0.2.11`，包含早期任务心跳和暂停状态修复。

这确认了代码部署成功。下一项验收是正式安装地址是否已经提供新版本，以及实际 Edge/Chrome 能否成功接管出版社页面。

## 正式安装入口回读

刚刚重新读取两个域名返回的脚本内容：

| 安装入口 | 实际脚本版本 |
|---|---|
| `gallery.gczhouwld.com` | **0.2.11** |
| `api.gczhouwld.com` | 0.2.10（尚未同步） |

主域名已经包含 `BATCH_SCRIPT_VERSION='0.2.11'` 和新的早期任务心跳函数，确认不是只更新了 GitHub 仓库。

**当前正式更新链接：**

[安装／更新历史正文 Tampermonkey 0.2.11](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)

请使用这个主入口，不要使用仍为旧版的 API 备用入口。

## 新版实际抓取验收情况

我再次运行了管理员只读诊断，结果见 [#38834544404](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38834544404)。

最近200条诊断事件中：

| 脚本版本 | 事件数 |
|---|---:|
| 0.2.8 | 103 |
| 0.2.9 | 80 |
| 0.2.10 | 17 |
| **0.2.11** | **0** |

0.2.10 最近上报的14次最终尝试中，7次为出版社脚本未确认启动、4次为超时、3次为许可待核实，仍无新增保存成功。

因此目前的准确结论是：**0.2.11 已部署并通过模拟浏览器测试，但尚未收到真实浏览器抓取回执，修复效果仍需实测。**

## 下一步：真实浏览器小批次验收

请在实际抓取使用的 Edge 或 Chrome 中，通过主安装链接更新 Tampermonkey，并确认扩展内版本是 **0.2.11**。刷新 Gallery 后，建议先运行「出版社回执核验（最多8篇）」，而不是立即重跑全部573篇。这个8篇是故障诊断样本，不是全库上限。

新版应能在出版社页面 DOM 尚未加载完成时记录 `publisher_dom_wait`，随后进入 DOI 核验和许可判定；如果仍然显示 `publisher_script_not_confirmed`，则需要按出版社页面及扩展注入状态进一步查验，不能把收到早期回执当作保存正文成功。

本地「失败详情」和「全库正文覆盖」可分别核对异常类别与 IndexedDB 已存数量。点击「立即上传待发诊断」，让剩余元数据回执进入管理员只读审核；已经保存在同一浏览器脚本的诊断密钥不必重输，也不要把密钥或受版权限制的正文发送到聊天。

当8篇样本确认能正常接管出版社页面后，再运行「一键补抓全部缺项」继续10月前符合条件的出版社论文；「全库开放正文补抓（本机）」是面向全部正式 DOI 的独立开放来源路径。现有69篇本机记录仍须区分部分正文和完整正文；公共全文索引不会因本次版本更新自动获得正文。

[查看 0.2.11 正式部署与真实诊断验收报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-16-v0211-pages-live-and-owner-diagnostic-readback.md)

**交付状态：0.2.11 主安装器已正式上线；API 备用域名仍为0.2.10；真实浏览器抓取成功率尚未得到验证。** 本次没有重部署生产 Worker，也没有修改 TOC、正文图、PDF、SI、许可规则、公共 FTS 或北京时间每日08:00的文献发布。
