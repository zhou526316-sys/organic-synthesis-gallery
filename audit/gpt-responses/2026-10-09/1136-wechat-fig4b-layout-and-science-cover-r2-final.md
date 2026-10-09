# WeChat 10 月 9 日 R2：Fig. 4B 位置、全篇图文关联与 Science 今日精选封面/标题修复

## 用户问题
- 10.09 今日精选原微信卡片 TOC 很小，顶部悬浮“今日精选·Science”，原生标题只有论文标题，未按用户提供的图 2 的完整栏目式大卡显示。
- 10.09 往期精选 Science 10.1126/science.aeh7895 原文 Fig. 4B 出现在文章末尾，但结尾没有解释该图。

## 根因
R1 图片映射把原文 Fig. 4B（r09）误放在往期精选最后“设计思想”章节，尽管实际文字解读位于“底物适用范围”第三段。复核发现其他 Fig.2A/2B、Fig.3A/3B、Fig.4A、若干机理及 SI 图也被整体配置到上一/下一章节。R1 审核仅保证图像资产出现一次，未强制检查图像语义与局部段落内容匹配。今日精选封面错误为保留顶部小标题而原生 title 取 paper-title-only，源摘要图仅占宽 640 px，底部大量空白。

## 实际修复
- 仓库唯一基线 main，来源脚本 ops/wechat-publisher/repair-oct09-figures-and-cover-r2.py，独立 QA GitHub Actions #37879871121 成功。
- 文字 revision 2026-10-09-r2；第一篇原生标题恢复为：有机合成文献日报｜10.09｜今日精选｜Science：通过氧气活化实现酶催化不对称氢膦酰化。
- 第一篇 Science 10.1126/science.aef3001 的封面采用已审核原始 graphical abstract 像素 x620:1260、y96:526，等比例扩大到 760×511（相比原来的640×430，横向 +18.75%），背景上方白色、下方 y514 开始深蓝色。去掉顶部图内“今日精选·Science”，深蓝区仅承托微信原生完整标题，不重绘任何化学结构。居中 1:1 裁切保留所有科学像素。图片 SHA256：b053a1cf071a824fc983c4c939d4455f6c82da4984ff5aba604f04ac92efcf24。
- 往期精选保持用户确认的七圆圈封面及 22 张原始正文图字节不变；重新映射所有 22 张正文图：Fig.2A/B 到 E/Z 条件段，Fig.3A 到 TH/dr 段，Fig.3B 与 Fig.4A 到 ee/dr 段，Fig.5A–C 到机理证据段，各 SI 图回到其实际解释段。原文 Fig.4B（r09）固定插在第 7 节“底物适用范围”第 3 段之后，最后的结论段不再出现。
- Fig.4B 段补充原文中的真实两步转化及数据：标准调聚再以 DBU/DCM 异构化得到 6a 64%、6b 94%、(S)-6a 85%、83% ee。不能将后续 1,7-二烯的双键位置完全归为 Pd 调聚的选择性。
- 图片资产总数 44（两封面 + 42 正文），均保留解码/哈希审阅；对应纯文字纯图片稿及 review gate 已更新为 R2 并通过。
- project editorial playbook 加入图片语义位置 QA，不能仅以数量/指纹作为图文位置验收。

## 微信真实回读与外部验收
- 单次受控触发 action sync_daily_draft 复用 10.09 原 media_id `KhELYUzvwADwB_l1xH1SWE4Nt7iQ0MsStYhbY_QtnZvPa4Y4cW7sWdrXjysQoIjO`，没有创建重复草稿。
- GitHub Actions #37879968659 `WeChat Draft Publisher` 全部成功；audit/wechat-publisher/latest.json 记录 stage=draft_update、draft_readback=ok、publish_id=null，原草稿未公开群发。
- **新的真实双篇预览**：https://relay.gczhouwld.com/wechat-preview/a02dad693ef23a37e6fdfef0.html
- 外部读回：两个 article，第一篇原生标题完整匹配；两个 DOI 和文章顺序正确；Fig.4B 的解释正文位置 12440、紧跟图注位置12656、下一节开始12724、结语14267，符合语义位置；第一篇封面 CDN 已更新、第二篇封面 CDN 不变；45 个显示图片 URI 中前两个为封面，其余 43 个 URL 完全相同，只改变预期图文顺序；Gallery 10.09 入口仍为 https://gallery.gczhouwld.com/?edition=2026-10-09。

## 回复用户
已修复。Fig. 4B 的确不应该放在结语，原来属于配置错位：正文在底物适用范围第 3 段讲 DBU 异构化，但图片被映射到最后一节。R2 已把 Fig.4B 移到对应段落，且检查并修复了往期精选另外几组同类错位。今日精选恢复完整“有机合成文献日报｜10.09｜今日精选｜Science：……”原生标题，封面删除顶部栏目字样、等比例放大原文 TOC，底部留深蓝文字承托区。两篇 42 张正文图原始素材未丢失，用户确认的七圈封面不变。微信原草稿 draft/update、draft/get 已通过，未群发。

真实预览：https://relay.gczhouwld.com/wechat-preview/a02dad693ef23a37e6fdfef0.html
