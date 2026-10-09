# Gallery 前端 TOC/正文图 A+B 已批准修复：实施与正式部署记录

北京时间：2026-10-09 17:45:14 +08:00
对话：接续界面优化（用户明确“批准”上一轮 A｜Angew 旧 TOC 与 live 数据一致性 + B｜媒体加载重复索引和懒加载优化）
仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一基线。

## 可核实工作结果

1. 已批准 A+B 主实现 PR #446（https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/446），合并 SHA d6ec1eb9e9f0602c60862c7ef2a5cc63349e259d。正式 Pages workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37910702528 completed success（literature_authorization/build/deploy均成功），Worker frontend sync 37910702485 success。
2. PR #446 修改 src/platform-api.ts：先按屏幕 DOI 读取 canonical API 小批次，实时 TOC 先行显示，静态索引仅作已验证图片/正文图后备；对 10.1002/anie.4335022 旧错图哈希 35f10c5321cd43179a4c71c73e388da8 做严格 DOI+hash 禁用，保留 R2 证据；共享5min媒体索引缓存。src/runtime-recovery.ts 和 src/performance-runtime.ts 共享缓存，移除重复 no-store 索引与最长1.9s静态正文图人工延迟，修复 detached lazy img 需要先插入DOM才能开始加载。cloudflare/scripts/sanitize-static-media.mjs 静态发布时也排除精确坏哈希。
3. PR #446 共15项检查成功，Node 12/12，真实页面 WebKit 4/4 包括新旧 Angew 图片冲突、正常TOC、Figure1和图片失败重试。正式数据核验：主站 GET /media-index.json?verify=d6ec1eb9 generatedAt=1791538209440（北京时间17:30:09），10.1002/anie.4335022 toc.available=true，contentHash=6406e6533f718759721bdd09740e0845；全文索引不存在旧坏hash。生产 GET https://api.gczhouwld.com/api/toc?doi=10.1002%2Fanie.4335022 同新hash及可用图。新像素是不是Wiley官方GA尚未独立比照（publisher读取受阻），只能认定旧错图不再使用且两端数据一致。
4. 因发现同源正文图全加载失败会触发 MutationObserver 重复建图，追加小补丁 PR #447（https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/447）合并SHA 1b3b98cc104ca76dab6d63ca4b521b50a9d70c6f，按 sourceKey 为同一失败来源限流60秒，成功或新来源可立刻恢复。Required quality gate、完整浏览器交互、frontend build/typecheck、API smoke均success；额外 refresh-cost (webkit) 检查截至本记录仍在安装测试依赖，非测试断言失败。其 Pages workflow https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37913046932 截至本记录仍pending（尚未上线验收），绝不提前声称补丁部署完成。
5. 不变更 Tampermonkey抓取、付费PDF权限、账号体系、每天北京时间08:00唯一新增时刻，禁止18:00新增。尚无真实中国运营商手机网络冷/热缓存完整waterfall，不能宣称精确提速率。

## 用户可见答复同步

（本轮为连续的部分答复，均记录于下）

**部分一：** 已根据你的批准完成定向代码修复，并提交至 [PR #446](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/446)。本次改动涵盖：让实时 TOC 优先于过期静态索引；在静态发布构建中拦截 Angew 10.1002/anie.4335022 已确认错误的图片哈希；首屏 TOC 不必等待整份媒体索引；统一媒体索引缓存、消除重复读取和静态回退中预设的正文图等待；修复正文图因懒加载时尚未插入页面而可能一直不显示的问题。当时尚未合并，待测试。

**部分二：** 新增的 WebKit 浏览器回归 4/4 通过，包括旧 Angew TOC 与实时新图冲突、官方 TOC、Figure 1 替代图及失败后重试；前端编译类型检查已通过。测试环境通过不等于正式网站已上线。

**部分三：** PR #446 合并至 main，合并提交 d6ec1eb9，15项 GitHub 检查通过；核验正式网站的部署版本及旧图片是否消失。

**部分四：** 生产构建中的静态媒体清理与媒体索引完整性验证均通过，进入最终网页资源生成；不提前将构建成功冒充部署。

**部分五：** 正式网站完成 A+B 主修复部署。GitHub Pages 37910702528 构建和部署成功。正式网站静态索引与生产 API 对 Angew 10.1002/anie.4335022 均返回新哈希 6406e653…，旧 35f10c53… 不在新媒体索引中。新图片是否为 Wiley 官方 GA 仍待有原始来源的独立逐图比对。

**部分六：** 正文图异常重试补丁 PR #447 合并至 main SHA 1b3b98cc，避免同一图片无限失败重试，同时允许新来源立即恢复。Required quality gate 和完整交互通过；WebKit额外依赖安装仍未给出结论，补丁生产部署另行验收。

**本轮终版：** 主修复已在正式域名上线，且旧 Angew TOC 误用冲突已通过生产 API/静态索引对照排除。补充的正文图片重复失败限流改动已合并，但对应 GitHub Pages 工作流 #37913046932 仍待执行，因此不能宣称该补丁在正式网页已经生效。没有真实中国手机冷/热网络耗时数据或新图片的 Wiley 官方逐图核验，不夸大验证范围。

审计规则：本次记录自身为 response 同步提交，不触发文献准入或其他生产数据编辑。
