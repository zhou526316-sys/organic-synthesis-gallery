# Gallery UI 续作：Angew 旧 TOC 残留与媒体索引重复读取诊断

北京时间：2026-10-09 16:59:38 +08:00
任务：Organic Synthesis Gallery 界面优化工作线（TOC/正文图加载变慢 + Angew 10.1002/anie.4335022 错图）
仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一基线；本轮只读审查，未修改生产媒体、代码或反馈状态。

## 已核对事实
- User's last summary incorrectly requested DOI. Historical approved repair explicitly names **10.1002/anie.4335022**. PR #443/#444 merged; explicit one-off CAS workflow run 37906209808 completed success 2026-10-09 16:39 Beijing.
- 16:57 左右只读访问生产 https://api.gczhouwld.com/api/toc?doi=10.1002%2Fanie.4335022：available=true；imageUrl 末尾 b5f8302e67e9148b29cd7f422e73e6d3.jpg；hash=6406e6533f718759721bdd09740e0845；新来源图像像素是否与 Wiley 官方 GA 一致尚未验证。
- 只读访问正式网站 https://gallery.gczhouwld.com/media-index.json：generatedAt=1791534350870，即北京时间 2026-10-09 16:25:50；目标 DOI 的 toc.available=true；imageUrl=media-mirror/worker-52eb28218d55f8af1d17e0f35ab4.png；hash=35f10c5321cd43179a4c71c73e388da8；与已独立证明不适合作为主图的旧 hash 相同。此快照生成于 CAS 之前。
- 代码 src/platform-api.ts 静态索引 5 分钟缓存并使用 no-cache，/api/media/batch 先从整份索引选本地结果，只有 TOC 或正文缺项才访问 canonical API，合并时优先使用已有 static TOC。对于目标 DOI，静态错误图可覆盖实时已变更结果；未取得手机真实浏览器的最终渲染截图。
- src/runtime-recovery.ts 被 src/bootstrap.ts 首屏之后异步导入，并在初始化独立以 no-store fetch 全量 media-index.json。与 platform-api.ts 缓存不共享。src/performance-runtime.ts 只在 gallery-media-static-fallback 启用时读取自己的清单，正文图额外等待最多 1900ms（相对于 installStartedAt），不是正常 API 路径普遍固定等待。src/gallery-performance.ts 也有独立 fetch，但未在 bootstrap 当前 import 链发现调用，不能计入已经证实的生产重复请求。
- src/main.ts 使用可视窗口限制：手机最多 6 篇，首轮请求 2 篇；桌面最多 14 篇，已有首屏分波加载。之前反馈 #41 已有相关优化 PR 合并，不能把它误报为完全未优化。
- 真实手机冷/热缓存网络瀑布图仍缺失。2.39M 为字符而不是实际压缩传输字节。不能将所有延迟归因于此。Wiley 论文官方 Graphical Abstract 页面本轮遇到读取限制，替换图科学正确性未最终认证。
- 项目约束：新反馈先核实由用户按项目规则批准，不能擅自改代码或生产数据；#42 状态弹窗此前已验收；账号 #438 5设备机制已部署，手机号页面存在但实际短信 phone=false、腾讯云未配置。08:00 唯一新增槽不触碰；不得恢复18:00。

## 向用户展示的完整答复（正文）

已接续 Organic Synthesis Gallery 的界面优化主线，沿用 `zhou526316-sys/organic-synthesis-gallery` 仓库的 `main` 分支及现有项目规则。

先纠正上一轮工作中的一个遗漏：**错误 TOC 文献的 DOI 已经明确，是 `10.1002/anie.4335022`，不需要再次提供。**

我查到仓库在今天（2026 年 10 月 9 日）已经合并了两项相关修复：

- [PR #443](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/443)：阻止将该 Angew 文献的底物拓展图误用为 TOC。
- [PR #444](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/444)：针对已确认的错误 TOC 执行精确匹配修正，不删除其他 R2 图片。

因此，这篇文献不应从头重新处理，而应重点验证**正式网站的实际显示是否已与修复后的媒体数据一致**。

## 一、已经定位到一处实际的数据冲突

最新只读核查发现，`10.1002/anie.4335022` 的两条正式数据源**目前不一致**：

| 检查项目 | 生产 API | 正式网站静态索引 |
|---|---|---|
| 数据来源 | `/api/toc` | `/media-index.json` |
| TOC 是否可用 | 是 | 是 |
| 图片哈希 | `6406e653…` | `35f10c53…` |
| 是否仍指向已确认错误的旧图片 | 否，已换哈希 | **是** |

更关键的是，目前 `src/platform-api.ts` 的合并逻辑优先保留静态索引中标记为可用的 TOC；只有静态数据不完整时，才向实时 API 补充查询。

这意味着：**即使后台已经取得新图，只要网站静态索引仍保存旧图，网页就可能继续展示错误 TOC。**

因此，问题不能仅靠清除浏览器缓存解决，需要修正静态媒体清单与实时媒体的优先级和同步逻辑。现阶段还不能仅凭新图片哈希，判定替换图已经与 Wiley 官方 Graphical Abstract 完全一致。

## 二、加载慢的代码结论

现有 `src/main.ts` 已限制首屏请求：手机首轮仅 2 篇、可视范围最多 6 篇，桌面最多 14 篇；这部分不应推倒重做。

额外开销主要来自两个实际加载模块：`src/platform-api.ts` 在批量媒体查询前先加载全量媒体清单（`no-cache`，5 分钟有效期），而首屏之后的 `src/runtime-recovery.ts` 又独立用 `no-store` 读取该清单。两者不共享内存中的结果。静态回退模块 `src/performance-runtime.ts` 还设置了最多约 1.9 秒的正文图等待，但只影响相应回退路径。

这能解释部分重复网络请求和等待；尚无真实手机冷缓存、热缓存网络瀑布图，因此不能给出未经测量的加速比例。

## 三、待批准的定向方案

**A｜媒体正确性。** 首先核验新图片是否为真正的 Wiley 官方 GA 或合法 Figure 1；随后让静态索引与生产 API 对齐，修正前端“旧静态 TOC 优先”的合并规则。对于已验证错误的 DOI+哈希，绝不能在网络失败时又把旧图当作有效回退。其他论文的正确 TOC 和正文图不受影响。

**B｜加载性能。** 合并媒体清单的缓存入口，取消恢复模块的无条件 `no-store` 重读；优先获取可视 DOI 所需的小批量媒体，其他图片继续按滚动位置加载。仅对近屏正文图取消静态回退的预设等待，保持离屏延迟加载和既有五分钟自动刷新。

执行前后应在手机 390×844 和桌面环境分别测量冷/热缓存的首张 TOC 显示时间、媒体请求次数、压缩传输量、正文图出现时间；回归覆盖实时 API 更新后旧静态索引尚未更新、网络故障、Figure 1 替代及滚动翻页。

此轮没有修改生产媒体、前端代码、反馈状态或定时发布。已修复的 #40/#42 不重做；#41 的既有首屏优化保留。最多 5 个设备登录机制已上线；手机号验证码的实际短信发送仍待腾讯云配置。

**请确认是否批准 A+B 两项定向修复。** 获批后再实施、测试、合并并核实正式网站显示，不以 PR 合并代替生产验收。

(本记录为用户可见完整答复同步，审计 SHA 即本提交。)
