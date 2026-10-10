# 2026-10-10 · Oct10 微信双篇草稿两封面直接替换成功

用户催促「不是有apikey吗？」：之前否认拥有微信草稿写入通道是错误的。现有仓库已经配置固定 IP 微信公众号 API 发布器；无需索取或暴露 API Key。按用户的既定明确授权，只更新草稿封面，不群发。

## 实际执行
- 正式已有双篇草稿媒体 ID：`KhELYUzvwADwB_l1xH1SWFOfn60HSWWcYlciDjMIDj7HKSul-GJJti3u0OIKFcyL`。
- 保持第一篇今日精选 Angew DOI `10.1002/anie.3306470`、第二篇往期精选 Nature Synthesis DOI `10.1038/s44160-026-01128-y`，标题和正文均未改动。保留作者中文名「仇友爱」。
- 第一篇封面从用户提供的 Angew PDF 第2页原文 Scheme 1B 完整裁切，在 1880×800 白色+深蓝底色封面上原始化学示意等比例扩大为 996×500 px，位于 x442–1438 / y7–507，标题深蓝底色自 y515 起，未绘制/生成新的分子结构。新图 sha256 `f60cf50ffbfa044ec9ddefc98603a982d92aa7beed4e1799ee51afb89a4a4ded`，路径 `public/wechat-assets/reviewed/2026-10-10-r2/anie3306470-original-scheme1b-enlarged-title-safe.png`。
- 第二篇封面直接使用用户最新发来的 **原始图片文件原字节** `image(20261010-022740).png`，1254×1254，sha256 `8748213670c0caeff07f5cf030390ba44e8878eb32982b20b0675ee34804c814`，路径 `public/wechat-assets/reviewed/2026-10-10-r2/nature-synthesis-user-selected-exact-square.png`。没有再使用图像生成工具重绘用户已认可的原图。
- R2 源审核：`audit/wechat-working/2026-10-10-r2-cover-review-and-qa.json` status=review_pass，`audit/wechat-working/2026-10-10-review-gate.json` textReview/imageReview=pass。49 张正文原图的文件字节、段落映射和原本的中文正文、标题都未改动；总 51 张审定图片。
- GitHub Actions R2 源审核 #38017823324 成功，之后触发正式 WeChat Draft Publisher #38017896348 成功。
- 微信返回：`audit/wechat-publisher/latest.json` mode=daily、stage=`draft_update`（不是新建）、`draft_readback=ok`、原 media_id 不变、`paper_count=23`、`publish_id=null`（没有群发）。
- **新真实预览**：https://relay.gczhouwld.com/wechat-preview/2a737c870da5ed6fe2cdde25.html
- 独立外部回读对比前后真实预览：均为同一对 DOI、相同顺序、同样的 2 篇与 52 个显示图片 URL；两张文章封面在位置0和1的微信 CDN URL 变更，剩余50个图片 URL **完全相同且顺序不变**（49正文原图+Gallery QR）。
- 每日文献数据库正式发布不变，公众号草稿未群发；新的预览链接以本条为准。

## 对用户答复
「有 API Key 和此前已配置的固定 IP 微信写稿通道。我之前说没有权限是错的。这次已经直接更新同一份草稿：往期精选换成你指定的原图，今日精选放大 Angew 原文 TOC 并保留标题安全区。双篇草稿的 draft/update 和 draft/get 均成功；只换了两张封面、其余50张显示图片不变。新真实预览：https://relay.gczhouwld.com/wechat-preview/2a737c870da5ed6fe2cdde25.html；未群发。」
