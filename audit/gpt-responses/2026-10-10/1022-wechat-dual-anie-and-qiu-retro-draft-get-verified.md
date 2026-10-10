# 2026-10-10 双篇公众号草稿 · 已创建并通过 draft/get 回读

## 用户选题
- 第一篇：今日精选 Angew. Chem. Int. Ed. DOI 10.1002/anie.3306470
  - 全标题：有机合成文献日报｜10.10｜今日精选｜Angew.：铁–LMCT/镍–SH₂协同催化游离羧酸直接甲基编辑
- 第二篇：往期精选 Nature Synthesis DOI 10.1038/s44160-026-01128-y
  - 中文署名应为 **仇友爱**，不是邱友爱。
  - 全标题：往期精选｜Nature Synthesis｜仇友爱等：醇与醇的电化学脱羟基交叉偶联
- 10/10 Gallery 唯一正式 08:00 审核：23 篇；productionCards=938，包含第一篇 Angew。

## 制作与科学质量控制
- Angew：读取 8 页正文、作者提供的 DOCX SI；10 个章节，35 段科研解读，18 张直接来自原文 Scheme1–4 及 SI Table/Fig 的正式编号图，不生成任何化学分子结构。
- Source-only import GitHub Actions #38016453669 verified successful。完整审阅清单 `audit/wechat-working/2026-10-10-r1-text-only.md` / `2026-10-10-r1-images-only.md`，review gate `audit/wechat-working/2026-10-10-review-gate.json`，结果 `audit/wechat-working/2026-10-10-r1-import-and-qa.json`。
- Nature Synthesis：保留 R4 已审定 31 张科学原图全部原字节，合成新的 r5 编辑源版本，替换标题正文中的「邱友爱」为「仇友爱」，只修改方形概念封面底部作者标签，不改变分子/反应结构像素。
- 两篇共计 49 张正文科学图片与 2 张封面，全部 51 个源文件通过源哈希/解码验证。Gallery QR 在微信正文独立生成，因此真实预览显示 52 个图片 URI。
- 原 SI UV-Vis EMF 不能直接用 Inkscape 展示完整曲线，改由原 SI EMF 转 PDF 的有曲线保留的源图转换，再裁取原图。未编号 SI 插图不伪造图号。
- Angew 学术深度：CHP 三功能；Fe–LMCT/Ni–SH₂ 自由基分流、优化和不同类别羧酸底物；DMSO 参与 CH₃/CD₃ 背景，CV 分级证据与潜在误解，限定实际底物与催化剂装载。

## 微信实际验收
- WeChat Draft Publisher GH Actions #38016516328 success。回执 `audit/wechat-publisher/latest.json`：
  - `status=ok`，`stage=draft_add`，`mode=daily`，`publicationSlot=2026-10-10T08:00:00+08:00`，`paper_count=23`
  - `media_id=KhELYUzvwADwB_l1xH1SWFOfn60HSWWcYlciDjMIDj7HKSul-GJJti3u0OIKFcyL`
  - `draft_readback=ok`，`publish_id=null`，`publish_status=null`。
- **真实微信双篇预览：https://relay.gczhouwld.com/wechat-preview/519cf19b5a0856ff152d93c0.html**
- 独立读回预览验证：2 篇顺序是 Angew 然后 Nature Synthesis；两篇 DOI、首篇完整原生标题、次篇「仇友爱等」均准确；网页日报 23 篇，Graphical title label no duplicates，Scheme1A/B、Scheme2A–C、Scheme3A–D、Scheme4A/B、SI Table S1/S2、SI Fig. S2/S3/S11/S12 均能在实际预览文本检出；实际 52 个图片 URI（包括 QR）；Gallery 域名为自定义域名，无 github.io。
- **只写草稿，没有群发，没有修改 10 月 10 日正式发布。**

## 提示
如果用户发现微信手机本机客户端特有的封面遮挡，以手机截图为准，在同一日期/稿件修正；不能宣称中继网页模拟完全等同手机端截图。
