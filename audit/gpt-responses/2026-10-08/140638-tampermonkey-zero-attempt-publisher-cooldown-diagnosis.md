# Tampermonkey zero-attempt publisher cooldown verification

Beijing time: 2026-10-08 14:06:38 +08:00
Context: 接续tampermonkey工作; user reports screenshot 23 blocked / zero publisher visits.
Baseline: main public/toc-mainline.user.js VPN Bridge 2.2.70, mainline install 6.2.51; controller 2.2.41.
Action: read-only diagnosis and feedback approval hold. NO functional source change, NO publisher requests or production data writes.

## Screenshot observations (2026-10-08)
- "10.1起177篇 / 未补齐23篇 / 待执行0 / 受阻23".
- "TOC 23 / 确实缺PDF 0".
- "PDF云端 已齐0 / 待验证0 / 未知177".
- "本轮累计 已遍历0/23篇 / 尝试0次 / 新主图0 / 新正文图0".
- The UI says "已遍历待办" although no publisher job was attempted.

## Repository source diagnosis
- public/toc-mainline.user.js ~112-113: publisher-wide access cooldown key and duration 30 minutes.
- ~862-889: prior publisher access gate writes persistent GM publisher-level cooldown, publisherAccessCooling(job) reads it.
- ~4931-4935: runManualFromHead candidate loop directly switches candidate.state='blocked' and candidate.lastReason='publisher_access_or_rate_limit', increments skipped, continues, WITHOUT incrementing attempts, opening a publisher tab, or dispatching.
- ~4863-4872: coverageStats reports blockedCount and attemptCount separately; complete UI badge at ~5005 says "已遍历全部待办" even if attemptCount=0.
- ~4331: forceStartFromHead() does not clear publisher access cooldown.
- ~4520-4560: readOwnerPdfInventory returns all 177 "unknown" when owner lease absent; also can be unknown on inventory request failure; cannot infer absence or stored count.
- Screenshot + source strongly identify the no-visit branch as publisher-wide cooldown, while the original triggering access-gate event is not verified without client logs.
- 2026-10-08 scoped main queue uses addedDate 2026-10-01 onward and retains 887 DOI full registry for integrity; do not touch old entries.

## Proposed patch (approval REQUIRED under PROJECT_RULES.md Feedback verification and user approval)
- On publisher cooldown preserve pending DOI state instead of converting all to blocked; show deferral and expiry timestamp distinctly from visited or attempted. Continue dispatching unaffected publishers.
- When every remaining job is deferred, show waiting/cooldown state and safe next retry, never "all jobs visited"; do not bypass actual access restrictions or saturate publisher with probes.
- Show exact PDF inventory auth state (lease missing/expired/request failed) separately from "stored" or "missing"; do not redownload unknown inventory.
- Focused regression: 23 pending, zero visits, active publisher cooldown must not be reported as traversed; later eligible jobs should dispatch only once on expiry; safeguard actual 401/403/429 and owner-PDF stored states.
- No code repair, merge or deployment performed pending user decision.

## User-visible reply synchronization

对。你的判断是正确的。**脚本根本没有开始抓取，却把任务标记成了“已遍历”。**

从截图可以直接确认：

| 指标 | 实际情况 |
|---|---|
| 10 月 1 日起收录文献 | 177 篇 |
| 未补齐文献 | 23 篇 |
| 实际尝试抓取 | **0 次** |
| 已遍历 | **0 / 23 篇** |
| 被标记为受阻 | 23 篇 |
| 新增 TOC / 正文图 | 0 / 0 |
| PDF 云端库存状态 | 177 篇全部未知 |

因此，问题不在于出版社没有图片，而在于**任务调度阶段就将全部 23 篇拦截了**。

“已遍历待办”这个状态具有误导性。正确状态应该是“23 篇任务尚未执行，全部被调度器阻止”，同时显示具体阻止原因，而不是让用户误以为已经尝试抓取。

我继续检查 2.2.70 版本的调度逻辑，重点定位为什么这 23 篇没有进入出版社页面。

## 已定位到具体代码问题

在当前 2.2.70 的 public/toc-mainline.user.js 中，发现了造成这一现象的调度逻辑：

    if (publisherAccessCooling(job)) {
      candidate.state = 'blocked';
      candidate.lastReason = 'publisher_access_or_rate_limit';
      s.skipped++;
      continue;
    }

这个逻辑存在一个关键缺陷：

**只要某家出版社存在尚未过期的访问冷却记录，就会直接将该出版社的所有待补文献标记为受阻，而不是逐篇尝试。**

当前冷却时间为 30 分钟。即使你点击“立即开始任务”，旧的出版社冷却记录仍可能生效。

结合截图中“23 篇受阻、0 次尝试”，可以判断这次任务确实是在这个预检查阶段被拦下的。至于最初是哪次出版社访问产生了冷却记录，还需要检查本地日志才能确认。

此外，**177 篇 PDF 状态未知不等于 177 篇没有 PDF**。这一项需要单独检查账号授权与云端库存接口，不能贸然重新下载。

## 后续建议

应当修复“冷却中直接记为受阻并宣布已遍历”的逻辑：把该出版社文献保留为待执行并明确显示冷却截止时间，同时继续尝试其他出版社；冷却结束后安全复查、再运行必要任务，不主动绕过真实访问限制。若全部待办只是延后，就显示“等待重试”，不能显示“已遍历”。

同时，PDF 的 177 篇“未知”需要明确区分“没有所有者授权”“库存接口错误”和“已确认缺失”，不能把未知当作缺失或已齐。增加回归测试覆盖“23 篇全未执行、0 次尝试”的案例，确保真正进入出版社访问流程之后才累计遍历次数。

**目前没有生成新版更新链接，也没有改动正式脚本。你批准这批已核实的修复后，我再按小批次完成修改、测试和上线。**