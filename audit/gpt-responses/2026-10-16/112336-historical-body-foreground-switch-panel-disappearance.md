# Project user-visible response synchronization: historical text capture apparently makes both Gallery panels disappear

- Beijing: 2026-10-16 11:23:36 (+08:00).
- User clarification: “我的意思是，抓取正文的脚本更新并使用后，会导致两个脚本的窗口都消失”.
- Source audit: `audit/tampermonkey/2026-10-16-historical-text-foreground-retry-both-gallery-panels-vanish-readonly.md` commit `1d3c99fd63053d29412ca3476717d36b87c56d74`.
- This turn investigated read-only and did not change production scripts. The latest feedback requires separate approval to modify.

## Complete user-visible reply

明白了：不是更新后两个窗口一开始就没出现，而是**历史正文脚本启动抓取后，连带让 TOC 和历史正文两个窗口都消失**。这是两个脚本可能存在运行冲突的问题，不能只按 Tampermonkey 权限排查。

我会检查正文脚本的页面切换、任务接管和标签页关闭逻辑，再与 TOC 面板的生命周期对照，判断是否有会影响 Gallery 主页面的操作。先只读核查，不直接修改生产代码。

明白。你的意思是：**两个窗口原本都正常显示，但启动新版历史正文抓取后，TOC 窗口和历史正文窗口一起消失。**

我重新检查了 `0.2.11` 的抓取调度代码，发现一个高度相关的原因：

**历史正文脚本会在出版社页面没有及时返回心跳时，强制打开一个前台标签页。**

代码中先使用 `GM_openInTab(..., {active:false})` 后台访问；如果判断出版社脚本未启动，就重试 `GM_openInTab(..., {active:true})`。

`active:true` 会让浏览器切换到出版社文章页面。由于两个控制窗口只显示在 Gallery 页面，**浏览器一旦切换到出版社标签页，看起来就像两个窗口同时消失了。**

这是确认存在的代码行为，但还需要判断你遇到的是否正是这条路径。

## 进一步核实与即时验证

[正式代码第 1718–1727 行](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/public/gallery-historical-text-pilot.user.js#L1718-L1727) 确认了这条路径：某篇 DOI 的出版社脚本约10秒未返回启动心跳，正文抓取控制器就关闭原后台文章标签页，再用 `active:true` 打开前台重试标签页。现有脚本也没有把焦点自动恢复到 Gallery 的动作。这种行为可以解释为什么一启动正文抓取，两个**只在 Gallery 页面显示**的面板会一起不见。

**请先检查窗口消失瞬间的浏览器地址栏：是否已经从 `gallery.gczhouwld.com` 变成 ACS、Nature、Wiley 或其他出版社文章网址？** 如果是，直接切回**原来那一个** Gallery 标签页，不必重装、清缓存或清空本机正文。若两个面板仍在，说明是脚本抢占前台而非真正把面板删除。

若地址栏始终还是 `gallery.gczhouwld.com`，且原标签页里的两个窗口确实都不见了，那么原因就不是简单的前台切换，需要再查 Gallery 页面 DOM 挂载/重绘和脚本异常。不能据此直接判断 Tampermonkey 权限被关闭。

建议后续修复方向是：后台批量正文抓取不再无提示抢占前台；将前台重试改为明确的人工选择，同时保留 DOI 身份绑定、失败诊断和原有版权校验。本轮先核实，不未经你批准修改生产脚本。

[只读诊断证据](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/tampermonkey/2026-10-16-historical-text-foreground-retry-both-gallery-panels-vanish-readonly.md)
