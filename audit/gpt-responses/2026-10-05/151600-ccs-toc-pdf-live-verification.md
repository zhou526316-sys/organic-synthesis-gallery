# Response synchronization

北京时间：2026-10-05 15:16 +08:00
上下文：Tampermonkey/VPN Bridge 支线；用户反馈 CCS TOC 似乎仍有问题，且流程中看不到 PDF 是否被抓取。本轮只做实时核验与问题归因，不修改生产代码，等待用户明确批准修复批次。

## Final response

你这个观察基本成立，但现在已经可以把问题拆清楚：**CCS 不是“完全没抓到 TOC”，而是“抓取库存、最终网页显示、单次任务状态三层没有同步”；PDF 则确实存在“流程在跑，但界面看不见，而且纯 PDF 任务会假报 success”的问题。**

我刚核对了最新实时回执、当前 local-capture-index 和线上 Gallery。

CCS TOC 这一侧，当前 10 篇 CCS 中，抓取库存里已经有 9 篇的 `official keyimage`。例如 `10.31635/ccschem.026.202607659` 已经在新版 6.2.31 / controller 2.2.40 下真实走到了 `/toc/ccschem/8/10`，日志明确是 `key_images=1 → official=1;persisted=1 → R2 upload complete`。608392、608407、608315 等也已经有 official keyimage 记录。

但是我进一步直接读了线上 Gallery：**608392 虽然抓取库存已经有 official keyimage，网页仍然显示 “Fetching original TOC / Figure”。** 所以你看到“CCS TOC 还是有问题”并不是错觉。现在最主要的问题已经从“CCS 抓不到”变成了 **“抓到了，但没有稳定进入/覆盖网页实际读取的 TOC 数据层”**，同时单次失败日志又会覆盖视觉上的状态判断，让已经有库存的 DOI 看起来仍像失败。

目前 10 篇里真正还没有 official TOC 的明确缺口是 `10.31635/ccschem.026.202507094`：当前 inventory 仍只有 Figure 1 fallback。Crossref 已经能给出 volume 8 / issue 10，但它最近保留的抓取还是旧 6.2.28 / controller 2.2.39，并没有真正用 6.2.31/2.2.40 重新完整验收。所以这篇还需要新版定向重跑，不能先宣称已经解决。

PDF 这边问题更明确。**PDF 捕获确实已经在运行，而且 lease 是 active 的。** 我还核实到一篇 ACS 实例 `10.1021/acscatal.6c05151`：浏览器拿到了 3,465,588 byte 的真实 PDF，随后 `private_pdf_upload complete`，回执明确 `stored=1`。因此 PDF 后端、私有存储和 owner lease 主链是通的。

但 CCS PDF 目前没有真正打通。608407 和 608392 的纯 PDF 任务在页面刚开始后几毫秒就执行 discovery，直接得到 `explicit_candidates=0`；然而任务却被记录成 `status=success / private_pdf_side_channel`。607659 因为前面先跑了 TOC，页面有足够加载时间，所以发现了 2 个 PDF 候选；但 CCS 的 `/doi/epdf/...` 返回 HTTP 200 时只有约 38 KB，实际不是有效 `%PDF` 文件，随后 GM fallback 又是 403。因此 CCS 还需要从 ePDF viewer/页面继续解析真正的 PDF 资源，而不能把 ePDF 包装页本身当作 PDF。

另外你“流程中完全看不到 PDF 是否被抓取”也是确认过的界面缺陷：当前实时面板只有“本篇缺项=PDF”和总剩余 PDF 数，没有独立的 PDF 状态行；`captureLiveUpdate` 也没有把 lease、discovery、download、validation、upload、stored 等阶段写进面板。更严重的是，当前代码只要 `result.privatePdf.status` 有任何值——包括 `not_found` 或 `failed`——本轮 coverage 就会把 PDF 义务清掉，因此“未抓到 PDF”和“已抓到 PDF”在队列层可能都表现成完成。

所以现在确认的修复批次应当是：

1. **CCS TOC 发布闭环**：不再只看单次抓取日志；以 current inventory 的 official receipt 为真值，把 official keyimage 真正同步/覆盖到网页卡片；已有 official 时不能继续显示 “Fetching original TOC / Figure” 或 Figure 1 fallback；单独让 202507094 用新版按 volume 8 / issue 10 重跑。
2. **PDF 状态真实化**：纯 PDF 任务先等待 DOI 页面和动态控件就绪，再做 discovery；只有 `stored/already_stored` 才算 PDF 完成，`not_found/failed` 不能再假报 success，也不能直接计入 fully resolved。
3. **PDF 实时可见**：面板增加独立“PDF”一行，实时显示“未授权 / 等待页面 / 查找 PDF / 浏览器下载 / GM 兜底 / 校验 / 上传 / 已存储 / 未找到 / 失败”，成功时直接显示文件大小和 `stored=1` 回执。
4. **CCS PDF 专用解析**：对 ePDF viewer 继续解析真正的 PDF asset；如果最终只能得到 HTML/challenge，就明确显示失败原因，不再显示 success。
5. **状态同步**：把“当前 inventory 已有 official TOC/PDF”与“最近一次尝试失败”分开显示，不能让旧失败回执掩盖已经成功存储的结果。

按照项目里“反馈先核实、你决定后再修”的规则，我这轮没有直接改代码。现在证据已经足够。**如果你批准，我就按上面这一整批修复，回复“批准修复 CCS TOC + PDF”即可。**
