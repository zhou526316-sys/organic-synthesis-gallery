# Tampermonkey / Angew TOC 运行诊断

- 北京时间：2026-09-26 00:21
- 任务：核查当前 Tampermonkey 运行状态，并重点验证“最近 Angew 似乎都没有 TOC”
- 性质：只读诊断；未修改生产抓取/发布代码

是的，需要改，而且你说的“最近 Angew 没 TOC”已经确认，不是视觉错觉。Tampermonkey 本身没有停：最近自动报告约 1 分钟前仍在产生；最近 200 条最新状态中有 72 success、101 partial、21 failed、6 controller_error，说明它还在连续开页和抓取。但目前“抓到/已有 TOC”的状态已经不能代表正式网页真的有 TOC。

我核了最近 10 篇 Angew（包括 10.1002/anie.9026373、2810612、7009966、4976267、3415969、5648702、9855820、8290035、3685338、9519061），正式生产 /api/toc 目前 10/10 都是 cache_miss。

目前确认有四个问题：

1. **旧 media-index 导致假 already_available。** 主控制器仍用 GitHub Pages 的旧 `media-index.json` 判断 TOC 是否存在。像 7009966、4976267、8290035、3685338、9519061，旧索引里有 TOC，所以 Tampermonkey 报 `toc=already_available`；但当前正式生产 API 实际是 `cache_miss`。这是明确的 source-of-truth 分叉。

2. **`toc=stored` 也不等于正式网页上线。** 我抽查了 8611979、7800916、1402106、9599258、4023427：Tampermonkey 都曾报告 `toc=stored`，但正式 /api/toc 仍是 cache_miss。现在的 `stored` 实际主要表示本地/R2 暂存成功，后面的“暂存 TOC → 当前生产 TOC”发布链没有闭环。

3. **Wiley/Angew 解析器仍存在真实漏抓。** 3415969、5648702、9855820 的 Wiley 页面分别已经完整加载约 3.4 万、4.8 万、4.2 万字符，DOI 绑定正常，但最终仍 `toc=not_found`。所以这几篇不是页面打不开，而是当前 Wiley Graphical Abstract 识别没有覆盖现有页面信号。9026373 也连续三次媒体抓取 `toc=not_found`，后来只把 Evidence 补成功。

4. **Wiley 重试解锁只修了一半。** 2.2.34 已经试图绕过旧 Wiley no-TOC 冷却，但后面的 `overnightRetryEligible()` 仍会把连续失败 3 次以上的 DOI 挡 12 小时。因此解析器升级后，这批 Angew 也不会立即自动复测。另外，线上安装器已经是 2.2.34，但当前最近 200 条浏览器报告全部还是 2.2.33/2.2.32，说明正在工作的旧标签页还没有收敛到新控制器。

建议按这个优先级修：

- **P0：统一媒体状态源。** 控制器不再用旧 GitHub Pages `media-index.json` 判断“已有 TOC”，改为当前 Worker/生产媒体清单；只有正式生产状态确认有官方 TOC 时，才允许 `captureToc=false / already_available`。
- **P0：打通 TOC 发布闭环。** 官方 TOC/Graphical Abstract 经 DOI、来源、图片字节、MIME 和哈希校验后，从 local capture 自动晋升到当前生产 TOC 存储；正文图仍保持现有 staging/review 规则，不跟着自动发布。
- **P0/P1：补 Wiley Graphical Abstract 解析。** 除 DOM 节点外，再扫描 Wiley 页面/嵌入数据里的强特征 `/cms/asset/...-gra-...`，仍坚持只接受 Wiley 官方域名和强 GA 信号，不做宽泛邻图猜测。
- **P1：给 Wiley TOC adapter 单独加 revision。** adapter 升级后只废除 Wiley 旧失败记录和双重冷却，并立即重排最近缺 TOC 的 Angew，不影响 ACS/Nature 等其它出版社。
- **P1：控制器版本收敛。** 服务端声明最低 controller revision；关键修复上线后，旧 2.2.33 标签页停止领取新任务并提示刷新/自动让新控制页接管，避免线上脚本已更新但实际一直跑旧逻辑。

次要问题也值得随后处理：最近不少 ACS 是 TOC/正文图成功但 Evidence failed；另外有少量 `bound_publisher_heartbeat_missing`。不过它们优先级低于当前 Angew TOC 和发布链分叉。

按项目的“反馈先核实、你决定后再修”规则，这一轮我**没有修改生产抓取代码**。如果你批准，我建议下一步直接做一版 **2.2.35**，先解决 P0 三项，再强制重排最近 Angew 做回归验收；验收标准不是“日志写 stored”，而是这些 DOI 的正式 `/api/toc` 必须真正 `available=true`。
