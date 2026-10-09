# Gallery UI A+B 生产验收和后续架构风险

北京时间：2026-10-09 18:09:05 +08:00
工作线：界面优化，承接 2026-10-09 用户“批准”A+B、随后“继续”的任务
仓库：zhou526316-sys/organic-synthesis-gallery, main 唯一生产基线
实际修改：PR #446（前端媒体正确性+加载修复）、PR #447（失败图有界重试，其他前端工作线合并）、PR #448（手动触发/PR 才运行的只读生产浏览器验收）。
本次接续中的新提交：PR #448 squash merge a0caef0cd58ecd4c43b3f0199b4fec869808ed2e；未改 PDF、会员数据、媒体抓取或 08:00 正式新增机制。

## 不可变证据
- PR #446 squash SHA d6ec1eb9e9f0602c60862c7ef2a5cc63349e259d；GitHub Pages run https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37910702528 completed success。Pages delivery 源版本与以上提交相同，build/deploy/authorization 全部成功。
- Production /api/toc?doi=10.1002%2Fanie.4335022: new contentHash 6406e6533f718759721bdd09740e0845，旧错误 35f10c5321cd43179a4c71c73e388da8 不再位于最新的公开 media-index.json 中。当前静态 TOC 相同新 hash，浏览器实际图片 URL /media/toc-cache/images/b5f8302e67e9148b29cd7f422e73e6d3.jpg，加载+解码成功。注意：尚无 Wiley 官方 GA 原图的独立科学正确性逐图审核，不夸大。
- 一次浏览器读取出现 fatal verified_architecture_unavailable:architecture_release_hash_mismatch;hot_fallback:architecture_release_hash_mismatch，并且无卡片（TinyFish read-only run 52b8c4ab-7cac-4a79-994b-b89b18a9fad7）。随后 PR #447 已于 09:42Z 合并，第二次 Pages run #37913046932 在 09:54Z 成功。此后 release-delivery/release.json sourceCommit 匹配，核对规范化的原始 trailing-newline SHA256 和声明 hash 相等。不能断言中途错误的唯一定因。
- 独立生产只读 Chromium 验收 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37914727696 success；扩展版 https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37915025155 success。390x844 手机首张实际解码 TOC 冷缓存 1038ms，热缓存 547ms；1280x900 桌面冷缓存 1263ms，热缓存 681ms。浏览器中手机12卡、桌面24卡，均无首页架构失败，第一层静态媒体索引请求每次 1 次，冷传输 384610 B，热缓存资源传输记 300 B。用户网络尤其中国大陆不可由 US runner 推断。
- 精确 10.1002/anie.4335022 搜索，真实 TOC 图片 loaded=true、oldWrongMirror=false；10.1021/acscatal.6c06476 6 张正文图片 6/6 正常解码。测试是生产只读 GET 和媒体 readOnly POST，不编辑用户/网站。
- PR #448 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/448 合并 SHA a0caef0cd58ecd4c43b3f0199b4fec869808ed2e；独立生产浏览器 QA、frontend/worker/API、Playwright Hot Archive / mobile、Required quality gate 等全部成功。只增 scripts/verify-gallery-live-home-readonly.mjs + .github/workflows/gallery-live-home-readonly.yml；PR/手动触发，无 schedule，合并不启动替代 Pages 发布。
- 发现版本错配的风险，建议单独核实/经新授权后，只对版本哈希不一致采取短延迟有界重读同代 manifest（包括 cache bust），严格保留哈希 fail-closed；不擅自更改架构读者。

## 本轮用户可见回复（持久同步；含此前部分和收尾）
### 部分 1
**PR #446 已正式部署成功。**
GitHub Pages 发布任务 #37910702528 已完成，结果为 success，对应合并提交 d6ec1eb9。
发布前文献授权、正式构建和最终部署三个阶段全部通过。关联的 Worker 前端同步任务也已成功。
这意味着本次 TOC 加载与媒体缓存优化已进入生产发布链路。下面继续核对网站实际返回的数据，确认线上显示与新代码一致。

### 部分 2
**发现新的生产阻塞问题。**
实际浏览器验收发现，正式网站虽然部署成功，但页面当时没有正常显示论文列表。
浏览器显示 `verified_architecture_unavailable:architecture_release_hash_mismatch;hot_fallback:architecture_release_hash_mismatch`。
搜索框、论文卡片及 TOC 均未正常呈现，因此本次修复暂时不能判定完成。
这一错误指向前端架构清单校验，但尚不能确认是 PR #446 引入的，还是并行发布造成的文件版本不一致。我会继续检查生产构建中的架构文件与校验逻辑，优先恢复网站正常显示。

### 部分 3
**正式网站已恢复，生产浏览器验收通过。**
新的只读 Chromium 验收 #37914727696 成功：手机 390x844 正常12卡；桌面1280x900 正常24卡；搜索与论文列表正常；架构读取无初始化错误；观察到9张 TOC 成功解码；Angew DOI 10.1002/anie.4335022 新图片成功加载；旧错图未重现。此前临时架构哈希错配在复验中未复现；并行 Pages 发布切换是可能但未经独立最终证实的原因。

### 部分 4
**加载性能实测**：生产只读 Chromium 扩展验收 #37915025155。手机首张 TOC 解码：冷缓存 1.04s / 热缓存 0.55s；桌面冷 1.26s / 热 0.68s；每次仅一个媒体索引资源请求。ACS Catalysis 10.1021/acscatal.6c06476 的6张正文图全部成功解码。
重要限定：美国 GitHub runner 的合成网络测量不代表中国大陆移动网络真实体验。

### 部分 5
浏览器网络记录：media-index.json 冷缓存传输量约385KB，热缓存该资源 transferSize 约300B。热缓存避免重新传输全量索引；不等同于 239 万字符的原始文件大小。本轮剩余工作是只读验收脚本归档及通用质量门禁。

### 最终收尾拟同步
**PR #448 已合并完成，正式生产 QA 脚本归档**：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/448 ，commit a0caef0c。它仅增加只读手动/PR 验收，不重新触发正式站部署或任何新增文献槽。
这次 A+B 修复已经上线，正式浏览器重新验收通过，TOC 和正文图可以正常加载。唯一值得另立新反馈的是并行 Pages 发布时短暂出现过架构清单哈希错配：现已恢复但具体诱因尚未完全定位。若需要防止它在下一次发布时重复，可在明确批准后仅对哈希校验失败的资源做有界配对重试，不降低完整性验证，不改 08:00 的发布控制。
