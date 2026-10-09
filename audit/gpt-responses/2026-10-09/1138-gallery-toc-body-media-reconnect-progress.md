# Organic Synthesis Gallery — Tampermonkey connection recovery and TOC/body media progress
北京时间：2026-10-09 上午，聊天恢复「连接中断，请继续，记得前面提到的网页不显示toc正文图等要一并解决」
已批准：10-09 Gallery 网页媒体显示定向修复，不授权修改每日 08:00 唯一新增文献槽或无权限PDF访问。

## 已验证的 durable partial user reply
### 进度核对
1. 网页自定义域名 TOC 动态 API 读取及已存图首次加载问题，PR #426 已并入 main SHA 57dca2da1beb8c40f0ec9ff9c723b3bbd2e2f3f0，GitHub Pages run 37878291900 build/deploy success，线上已拉取最新构建物。Tampermonkey Bridge 2.2.73 / Engine 6.2.54 / Controller 2.2.41 均未改。
2. 此前在线逐篇核对 10-09 28 条新增记录，24 条生产 TOC available:true（21官方 TOC、3篇 Figure1 替代），余4条 Chem2 和 RSC2 无主图，未宣称全部成功。
3. 最新 Pages live auto-body-status.json 确认 98 张经过独立哈希、原始来源与解码验证的正文图已纳入公开静态媒体：17篇论文。live media-index.json 为 10.1021/acscatal.6c06476 列6张正文图，10.1021/jacs.6c11855 列9张；Nature/Science部分仅有 Figure1 替代，额外正文图等待符合图文发布配对门槛；JACS 10.1021/jacs.6c17387 >10张被保留待核，原因 auto_card_display_limit。不混淆 Worker D1 /api/article-figures 的零条与 Pages 静态 media-index 的公开记录。
4. 用户 11:01 左右上传的真实诊断：scope205，任务43、访问42、尝试47、确认补齐24、受阻19、TOC剩余17、正文暂存135、PDF owner 库189 ready/10 pending/6 missing。RSC publisher shell 0正文图以及 PDF403，Chem 103008/103043 controller_timeout，不属于可伪称修好的内容。
5. PR #429 https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/429 独立处理可信 Nature/Science Figure1 primary 配套正文图、PDF HTTP403 但正文图完整的出版回执。shared/body-packet-completion.mjs 严格条件在 Worker 和 Pages 两层共用，TOC 官方真实性/DOI/hash/bytes/解码/原图保留，PDF 仍失败。因保护分支约束，恢复原定每篇最多10张公开正文图的策略，>10篇需另获授权/单独审批，绝不伪装“全已补齐”。
6. PR #429 最新 HEAD d55622bbfa8924ae03761be7c3ff74a78788d9e1，媒体/Worker回归已通过，Playwright仍运行，历史媒体fixture GitHub artifact HTTP410旧故障明确独立且未跳过安全验证；生产代码仅第426版，不得提前宣称429上线。

### 拟向用户发送的部分回复
“连接中断后的工作已经接续。网页 TOC 的自定义域名路由和图片加载问题已在 PR #426 修复、正式 Pages 部署成功；10 月 9 日 28 篇中有 24 篇提供生产主图记录。正文图方面，正式在线发布清单已纳入 17 篇共 98 张经过原图、DOI、哈希和解码校验的图片；不是仅有 Tampermonkey 暂存回执。尚未全部补齐：Chem 和 RSC 的主图缺项仍存在，一些 Nature/Science 的正文图还卡在 Figure 1 配对规则，超过10图的 JACS暂受现有发布上限保护。下一项兼容修复正在 PR #429 验收，尚未合并。”
