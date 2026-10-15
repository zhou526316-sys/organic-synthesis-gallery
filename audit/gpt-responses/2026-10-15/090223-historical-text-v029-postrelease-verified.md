# Response sync — 历史正文 v0.2.9 已发布及真实抓取待验收

Beijing time: 2026-10-15 09:02:23
Chat scope: Organic Synthesis Gallery / historical article text publisher tab hydration and rights checks, user follow-up "继续".
Related PRs: #655, #658; deployment #38542762375; real diagnostics #38663212945.
Final audit: audit/historical-body-review/2026-10-15-historical-text-v029-live-release-and-diagnostic-acceptance.md
Latest verification report commit: db128b9cba6daca52e16b3daa92bbe5bb7c5461f.

## User-visible reply (partial + completion)

**历史正文脚本 `0.2.9` 已正式上线。**

我已核对 [Pages 部署 #38542762375](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38542762375)：文献授权检查、构建和部署三项全部成功。刚刚直接读取两个正式安装地址，也都确认返回 `@version 0.2.9`。

- **主安装地址：** [更新历史正文 Tampermonkey 脚本 0.2.9](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)
- **备用地址：** [API 域名安装入口](https://api.gczhouwld.com/gallery-historical-text-pilot.user.js)

上轮造成论文页面过早关闭的修复现在已经发布，不再只是 GitHub 仓库中的修改。

### 实际抓取验收尚有一项待确认

我又读取了管理员最新的 200 条历史正文诊断事件，运行记录为 [#38663212945](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38663212945)。

其中包含 133 次独立尝试，但**全部来自旧版 `0.2.8`，尚无 `0.2.9` 的实际浏览器抓取回执**。因此，目前可以确认部署和模拟浏览器测试通过，还不能确认新版在你的 Edge/Chrome 环境中改善了多少篇。

升级后，旧版中 DOI 已核实、但误判许可或正文不足的记录，会获得一次安全重检。新脚本也会把“许可证仍可能加载中”和“已发现其他许可但未确认可复用”分开处理。

### 浏览器验证及继续全库抓取

你需要在实际执行抓取的 Edge/Chrome 中通过**上面的主安装地址**更新同一个 Tampermonkey 脚本，并在扩展管理界面确认版本为 `0.2.9`。网站安装入口升级不等于已经替你的浏览器自动安装。

打开 Gallery 首页左下角的「历史正文 · 独立补抓」，建议先运行「跨期刊正文证据核验（12篇）」复测此前 DOI 已核实但许可或正文失败的记录，然后检查「失败详情」和「全库正文覆盖」。如果历史诊断密钥已保存在该浏览器，使用「立即上传待发诊断」即可发送元数据回执，无须重复输入。新版至多保留两个最新的待核实论文标签，其他已处理标签仍会自动回收，这是有界资源控制，不再因连续两次 DOM 节点计数没变而马上宣告许可失败。

原定的**全部正式 DOI 正文覆盖**目标不变：「全库开放正文补抓（本机）」扫描整个当前正式 DOI 目录，包含 10 月之后和日期未确定的论文，不设 20 篇全局上限；出版社「一键补抓全部缺项」仍是 10 月前文献的独立入口。扫描来源、取得明确许可并保存正文、最终进入全站公共全文检索，是三个必须分开验收的环节；尚不能把扫描完成等同于千余篇正文全部到位。

核验记录已保存至 [v0.2.9 上线及诊断报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-15-historical-text-v029-live-release-and-diagnostic-acceptance.md)。实际浏览器运行后才能形成新版成功率与残余失败的可靠统计。
