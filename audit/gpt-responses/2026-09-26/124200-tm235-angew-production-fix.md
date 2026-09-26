北京时间：2026-09-26 12:42
任务：Tampermonkey 运行检查与 Angew TOC 修复（用户已批准）

已继续完成本轮修复和生产验收。

当前结论：

1. **Bridge 2.2.35 已正式上线。**
   - Tampermonkey 不再用旧 GitHub Pages `media-index.json` 判断“已有 TOC”，改为直接读取当前 Worker/D1 的生产 media inventory。
   - 官方 TOC 只有在 Worker 已真正写入生产 `toc_assets`、正式 `/api/toc` 可读后，浏览器才允许记为 `stored`。
   - Wiley/Angew 增加 article-scoped embedded `-gra-` Graphical Abstract 识别和 authenticated iframe recovery；仍限制 Wiley 官方来源，不做宽泛邻图推断。
   - 旧 Wiley no-TOC 失败在 2.2.35 升级后可立即重新尝试，不再被旧 12 小时双重冷却挡住。
   - 服务器 capability 已要求 `mediaControllerRevision=2.2.35`，旧 2.2.33/2.2.34 控制器不会继续领取新任务。

2. **“抓到了但正式网页没 TOC”的发布断点已经清空。**
   新分页 backfill 已完整处理当前 R2 的 336 条 official TOC 暂存记录：
   - 新晋升到生产 D1：92
   - 原本已在生产：244
   - 失败：0
   - 合计：336/336
   回填现在按 Angew 优先、再按最新时间处理，并使用 offset/scan 分页，不会反复从头扫描旧失败项。
   同时生产 `importToc` 已支持经过主动内容/外链安全检查的 SVG TOC，解决此前一批“R2 成功、生产晋升 400”的问题。

3. **重复 Worker 部署竞争已经修掉。**
   原先 `Deploy Worker frontend assets` 和 `Deploy Worker additions` 共用 `cloudflare-worker-production` concurrency group，并且同一批 Worker 源文件会同时触发两条部署链，导致 pending run 互相取消、甚至后执行的旧资产部署覆盖新 Bridge。
   现在：
   - `Deploy Worker frontend assets` 是唯一 push-time production Worker publisher；
   - 原 `Deploy Worker additions` 只保留 schema / integration maintenance，不再部署 Worker 代码或前端资产；
   - schema maintenance 使用独立 concurrency group；
   - CI 已加入 single-owner deployment contract。
   最终生产部署 run `36218486356` 已 success。

4. **最近 10 篇 Angew 的实际生产状态：目前 3/10 已有正式 TOC。**
   已恢复：
   - `10.1002/anie.2810612`
   - `10.1002/anie.7009966`
   - `10.1002/anie.4976267`

   当前仍为 `cache_miss`：
   - `10.1002/anie.9026373`
   - `10.1002/anie.3415969`
   - `10.1002/anie.5648702`
   - `10.1002/anie.9855820`
   - `10.1002/anie.8290035`
   - `10.1002/anie.3685338`
   - `10.1002/anie.9519061`

   因为 336 条当前 local official backlog 已全部处理完，这 7 篇不能再靠现有 R2 official backlog 自动恢复，需要 2.2.35 在 Wiley 页面重新识别/抓取 GA（或者以后单独做 legacy static asset recovery）。

5. **现在真正剩下的是你本机 Tampermonkey 版本收敛。**
   自定义域安装器已经核验为 **2.2.35**，但服务器最近收到的浏览器报告仍只有 2.2.34/2.2.33，尚未收到一条 2.2.35 报告。服务器已经主动拒绝旧 controller，所以它不会继续产生错误的 `already_available` 判断。
   
   如果不做任何操作，可以等 Tampermonkey 自己按 `@updateURL` 周期检查并升级；如果希望这 7 篇 Angew 现在就重新开始抓，当前这次版本切换建议手动更新一次 2.2.35 并刷新 Gallery 控制页。以后更新路径已经统一，不需要每一版都手动换脚本。

本轮主要生产提交：
- `8078e04a95f558407b97ff994890b79f602ffd25` — Bridge 2.2.35 / Angew production TOC 修复
- `f6f8cb3c81c13be47d7773d85d03d638a7610b18` — 分页 backfill + Angew 优先 + sanitized SVG
- `db024328b0cad37de46c2ef97b97abd1f916ebe2` — 单一 Worker 部署所有者

