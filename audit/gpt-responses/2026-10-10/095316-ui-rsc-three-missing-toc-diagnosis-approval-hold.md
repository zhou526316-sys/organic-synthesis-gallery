# UI/RSC 三篇 TOC 缺漏：核查与审批待决

北京时间：2026-10-10 09:53:16 +08:00。
聊天主线：Organic Synthesis Gallery 界面优化；用户截图反馈“怎么还有这种？”。
本轮仅只读 GitHub/线上媒体 API/采集日志检查，没有修改前端、Tampermonkey 采集代码、生产 DOI 或媒体资产。按 PROJECT_RULES.md 的 feedback user approval gate，本轮处于核实与批准待决状态。

## 截图中的目标论文与正式 API

| 期刊 | DOI | /api/toc | media-index.json | 正文图 | 暂存正文图 |
|---|---|---|---|---|---|
| Chemical Science | 10.1039/d6sc06374h | available=false/cache_miss | 无条目 | 0 | 0 |
| Green Chemistry | 10.1039/d6gc04458a | available=false/cache_miss | 无条目 | 0 | 0 |
| Green Chemistry | 10.1039/d6gc05783g | available=false/cache_miss | 无条目 | 0 | 0 |

公开媒体需求清单 public/toc-demand-live.json 在北京时间 2026-10-10 08:00 生成：2026-10-01+ 的 RSC 条目 21 篇，其中可见主图缺失 state=no_visual 14 篇；21 篇正文图计数均为 0（此为需求清单统计，不应和 09:46 之后的动态状态混同）。

## 用户授权的实际采集报告（只读）

/api/media/tampermonkey-reports 的精确 DOI 查询显示：
- 10.1039/d6sc06374h：attemptCount=22；最新 2026-10-09T15:09:06Z partial，toc=not_found，figures=0/0，published=0；Silverchair DOM img=9，figure/figcaption=0，metaVisual=0，TOC 筛选 accepted=0。
- 10.1039/d6gc04458a：attemptCount=31；最新 2026-10-09T14:30:15Z partial，同上 0/0/0，DOM img=7，figure/figcaption=0，metaVisual=0。
- 10.1039/d6gc05783g：attemptCount=26；最新 2026-10-09T15:01:15Z partial，同上 0/0/0，DOM img=7，figure/figcaption=0，metaVisual=0。
- 三篇均在真实 RSC Silverchair shell 中见到 pdf.gif 页面预览图，原验证器合理拒绝把 PDF 首页预览冒充官方 TOC 或编号 Figure。日志中有 architecture_membership_serial_conflict 的旁路观察者报错，但不能把它未经证明地当作这三篇的主图缺失直接原因。
- 目前报告的运行引擎版本为 6.2.58；main 脚本版本 6.2.59。

## 已核实代码因果与前端独立缺陷

1. public/toc-mainline.user.js 中 rscNativeAjaxBoundRoute(job) 位于第 2574 行附近；其固定 DOI 白名单：
`if(doi!=='10.1039/d6sc06407h'&&doi!=='10.1039/d6gc03748h')return null;`
所以截图的三篇 DOI 即使获取了正确 RSC Article ID（1365993/1365974/1365996），也不会调用仅对上述两篇启用的 `ArticleAbstractAjax` 官方第一方备选路径。这证明它们未得到该候选路径的尝试，不证明该路径扩大后必然成功。
2. src/main.ts hydrateMediaBatch 的成功但缺图分支只更新 .generated-graphic-status 并设置 state=not-yet-available；对先前网络故障插入的 .toc-retry 按钮未执行替换，错误提示可能在后来 API 返回 cache_miss 后仍黏住，造成“主图服务暂不可用”的误导。必须区分临时请求失败与确实未取得合格主图。
3. 不应降低 TOC/Graphical Abstract 真实性防护：禁止 PDF 封面预览伪装官方 TOC；单 DOI+articleId 必须由同一篇真实 RSC 页面绑定、要求 HTTPS RSC 第一方、只读 GET、9 秒上限、403/401/429 拒绝再试，避免新增主站外通配请求；可根据证据单独使用核验后的 Figure 1 作为标注清晰的替代主图。
4. Tampermonkey 采集主线与前端主线应分离回归/部署，保持 Oct1+ 合并正文+全文+私有 PDF 采集契约，08:00 唯一正式文献新增时刻不变。

## 待用户明确批准的两个修复项

A. 在既有 RSC 白名单严格来源/DOI/文章ID绑定下，将官方 Silverchair AJAX 作为**通用符合条件 RSC 文章缺图候选路径**，而非仅两篇固定 DOI；按截图三篇和其它 RSC 可见缺口做受控回归，需实际用户浏览器凭已授权会话访问并回传真实抓取记录；若遭访问拒绝或无官方语义图，仍保留缺失状态，不伪造、不绕过权限。
B. 修复前端过期的 .toc-retry 错误提示：当批量 API 成功明确返回 cache_miss 且无已验证静态主图时转换为“原始主图待补齐”，仅真正网络/服务不可用时保留可操作重试；新增网络失败→恢复但暂无媒体→随后发布媒体的浏览器测试，不影响现有正确图和正文图。

**审批状态**：未批准，禁止写入上述修复代码，禁止发布/篡改媒体。可继续只读核查。需要用户明确批准 A+B 或指定其中一项。

## 本轮用户可见答复完整同步

确实还有，而且这次已经查明：**不只是前端加载问题，这三篇文献的 TOC 根本没有成功进入正式媒体库。**

我逐一检查了截图中的 DOI：

| 期刊 | DOI | 正式 TOC 状态 |
|---|---|---|
| Chemical Science | `10.1039/d6sc06374h` | 未获取 |
| Green Chemistry | `10.1039/d6gc04458a` | 未获取 |
| Green Chemistry | `10.1039/d6gc05783g` | 未获取 |

三个 DOI 的正式 API 均返回 `available: false`、`cache_miss`，最新 `media-index.json` 也没有对应记录。

所以仅优化网页加载速度无法解决这种情况。必须同时处理**图片采集缺漏**和**前端错误提示不准确**的问题。“主图服务暂不可用”并不等于图片正在抓取，也不应该把尚未获取的 TOC 伪装成一次临时网络故障。

进一步查到了抓取端的症结：这三篇并非没被遍历，历史上分别已尝试抓取 22、31、26 次，最新结果仍是 `toc=not_found; figures=0/0; published=0`。三个 RSC 页面实际返回的 Silverchair 页面壳没有可识别的图文容器，所见的 PDF 首页预览图也不能冒充官方 TOC。

更关键的是，现有 Tampermonkey 的官方 RSC `ArticleAbstractAjax` 备用分支仍硬编码只支持 `10.1039/d6sc06407h` 和 `10.1039/d6gc03748h`。**截图中的三篇都被这个分支跳过了**。这才是反复点重试仍不会凭空出现图片的重要原因之一；扩大分支能否取得图片，还需真实的用户浏览器回执验证。

今日 08:00 的 RSC 媒体需求清单中，10 月 1 日之后共有 21 篇，其中 14 篇仍是 `no_visual`，不只是截图这三篇。此外前端旧“服务不可用”按钮不会在 API 恢复但明确返回 `cache_miss` 时被正确清除，导致“暂不可用”文字可能一直残留。

建议分别修两项：
A. 把已有的 RSC 第一方 AJAX 备选采集扩展为 DOI/Article ID 严格绑定的通用 RSC 缺图路径，保留 401/403/429 拒绝、图片真实性审核以及 PDF 预览拦截；真实采集仍由当前用户的 Tampermonkey 浏览器执行，不承诺没有权限时也一定抓得到。
B. 修复网页状态机：真正的网络故障显示“主图服务暂不可用”，API 明确没有媒体时显示“原始主图待补齐”，并清除过时的重试按钮；新增网络失败→确认缺图→后续补齐的浏览器回归。

按照项目的“吐槽先核实、用户批准后修复”规则，**此轮只完成调查，尚未改动生产代码或图片数据。请确认是否批准 A+B 一起修复。**
