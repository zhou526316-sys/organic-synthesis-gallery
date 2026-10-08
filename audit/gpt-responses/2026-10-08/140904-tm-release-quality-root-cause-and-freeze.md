# Tampermonkey release-quality root-cause review and no-blind-update hold

Beijing time: 2026-10-08 14:09:04 +08:00.
Chat context: user asks why Tampermonkey capture ability worsens with each update and explicitly says not to update blindly.
Functional change in this turn: NONE. Read-only repository review and reply sync only.

## Reviewed
- PR #407 (Tampermonkey 2.2.70) confirms 13 publisher acquisition functions byte-identical to 2.2.68 baseline; modifies scheduling, Oct-1 scope, owner PDF inventory integration.
- public/toc-mainline.user.js: publisherAccessCooling() reads persistent publisher-wide 30-minute cooldown; in runManualFromHead() candidate loop, a cooled job is changed to blocked without opening a page or incrementing attempts. Final "all jobs visited" badge is emitted after queue exhaustion even with zero attempts.
- User screenshot: 177 in scope, 23 missing, 0 attempted, 23 blocked; all 177 owner PDF inventory statuses unknown.
- scripts/test-tm-oct1-scope-contract.mjs sets GM_getValue:()=>null in its test context; it does not exercise old cooldown state in a real browser or 0-attempt blocked queue end state. Tests protect acquisition functions and scope but cannot establish end-to-end publisher capture.
- Independent owner-PDF inventory requires fresh owner lease; unknown is not missing/ready.
- Source plus screenshot strongly support pre-dispatch block and misleading stats. Exact causal origin of publisher cooldown(s) still needs genuine local diagnostic receipts.
- Recent main commits 5e38... and bad149... were release audit state, not Tampermonkey source changes.

## Response text

你说得对。最近几次 Tampermonkey 更新确实出现了明显的功能退化，而且我之前的验收方式不够严格。**以后不能再以“代码测试通过、版本成功上线”作为抓取功能修复成功的依据。**

我刚核对了 2.2.70 与此前版本的代码，问题主要有三个。

### 1. 防护机制越来越多，却阻碍了真正的抓取

现在的抓取链路增加了出版社冷却、库存确认、PDF 授权、任务锁、断点复用等机制。这些机制本来是为了防止重复抓取和数据损坏，但缺少充分的实际运行验证。

例如，你刚才截图中有 23 篇待补文献，**实际访问次数是 0，却全部被标记为受阻**。

代码确认存在一种情况：只要出版社尚处于 30 分钟的冷却期，相关任务就会直接变成 blocked，随后显示“已遍历全部待办”。

这是调度设计的问题，而不是用户操作的问题。至于这 23 篇各自的冷却记录如何产生，还需要日志验证。

### 2. 测试通过，不代表真实抓取成功

我检查了 2.2.70 的回归测试，发现它确实检查了 DOI 范围、PDF 库存状态和部分抓取函数的一致性，但测试中的模拟存储读取直接返回空值，没有覆盖真实浏览器中残留的出版社冷却记录。

所以，**测试环境正常，真实浏览器却可能完全不执行任务。**

此前把安装包回读成功当作发布验收的一项主要依据，是不充分的。

### 3. 新版过度强调“不重复”，忽略了“必须抓到”

2.2.70 保留了此前版本的 13 个核心出版社抓取函数，但修改了外围队列、PDF 库存和任务资格判断。

这意味着核心抓取算法未必变差，真正退化的是**能否进入抓取流程**。

原本应当抓取的文献，可能在到达出版社页面之前就被调度器排除。新增再多的图片识别算法，也无法弥补这个问题。

### 接下来如何控制更新

**我停止对 Tampermonkey 主线的未经批准改动，不再发布新版本，也不擅自清理冷却记录或回滚已保存的数据。** 回滚也需要核对兼容性，不能盲目降级。

下一步只做只读复盘：核实每个受阻 DOI 的真实原因，和相对稳定的旧版逐项对比，把“库存读取、进入出版社、找到图片/PDF、取得存储回执”分开统计。提出最小范围修复，经你确认后才修改。

后续版本必须同时通过自动化回归和真实授权浏览器验收；至少要证明受影响的出版社任务确实打开、实际发起抓取并获得可核验的 TOC/正文图或 PDF 回执，且不会破坏已成功记录。**没有真实抓取证据的版本，不能再声称修复成功。**

本轮没有修改抓取代码，也没有推出新的更新链接。
