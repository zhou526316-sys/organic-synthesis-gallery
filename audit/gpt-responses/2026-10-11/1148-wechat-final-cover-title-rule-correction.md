# Oct 11 WeChat cover/title precedence correction and prior draft evidence

- Context: current WeChat Official Account work line, user challenges incorrect recollection of selected final artwork/title style.
- Beijing date/time: 2026-10-11 11:44:49 +08:00 (time tool confirmed)
- Read-only sources: docs/wechat-editorial-contract.md (line 8 earlier conditional, line 9 later override), 2026-10-08-r8-native-title-qa.json, 2026-10-08-r9-cover-qa.json, 2026-10-09-r2-correction-qa.json, public/wechat-editions/2026-10-08.json and 2026-10-09.json, and both 2026-10-11 cover and manifest files.
- Oct 8 R9 verified archived draft preview: https://relay.gczhouwld.com/wechat-preview/b6af235f8d6233cd495b20ae.html
- Oct 9 R2 verified archived draft preview: https://relay.gczhouwld.com/wechat-preview/a02dad693ef23a37e6fdfef0.html
- No changes to WeChat draft, artwork, editorial manifests or production code. No send. This file logs corrective feedback/verification only.

## Complete user-visible response (substantially as sent)

你说得对。上次是我错误地沿用了**已经被后续修改取代的旧版封面规则**，没有按照最终确定的版本执行。项目规则中其实已经记录了你的最新要求，但我没有正确处理规则的先后顺序。

现在明确纠正：

- **今日精选封面：**尽可能放大论文原始 TOC，保持化学结构完整、清晰，不额外添加“今日精选 JACS”、日期或栏目标签。不能为了装饰牺牲 TOC 的展示面积。
- **微信原生标题：**必须包含“有机合成文献日报”、日期、“今日精选”、期刊名称和论文中文标题。
- **标题区域：**封面需要兼顾微信原生白色标题的显示，但应尽量压缩预留空间，不能遮挡 TOC，也不能产生大面积无效留白。

我会以你最后确认过的实际微信草稿和项目规则为依据，重新核查 10 月 11 日的两篇文章，而不是继续凭之前的概括判断。

## 我找到了之前真正验收成功的草稿

**10 月 8 日 · JACS 最终版 R9**  
主封面移除了顶部“今日精选·JACS”，等比例放大原始 TOC，并保留完整的微信原生标题。实际草稿 draft/update 和 draft/get 均成功。  
历史草稿预览：https://relay.gczhouwld.com/wechat-preview/b6af235f8d6233cd495b20ae.html

**10 月 9 日 · Science 最终版 R2**  
同样删除了封面的“今日精选·Science”，原始 graphical abstract 的展示宽度增加 18.75%，同时恢复包含日报、日期、栏目和期刊的完整标题。  
历史草稿预览：https://relay.gczhouwld.com/wechat-preview/a02dad693ef23a37e6fdfef0.html

这两份都有当时微信草稿成功回读的仓库记录，而不是单纯的设计方案。它们才是应当参照的最终版本。

对比后可以确定，10 月 11 日的草稿有两个直接错误：**封面重新加入了不需要的“今日精选 JACS”以及站名装饰，微信原生标题却反而丢掉了完整的日报前缀。** 这是把已经淘汰的旧组合重新用了回来。

**10 月 11 日今日精选应使用的原生标题：**

有机合成文献日报｜10.11｜今日精选｜JACS：镍催化烯烃双碳官能团化实现气态烷烃的区域与对映选择性官能化

错误不在于历史要求不存在，而在于我没有正确遵循指令的最终版本：同一份规范前面保留着“带栏目封面、只写论文题名”的旧条件分支，后面明确记载了 10 月 8 日取消封面栏目、恢复完整原生标题的更新。我误用了前者，而且没有拿 10 月 8 日 R9、10 月 9 日 R2 的已验收草稿逐项核对；上次还用无关的检索示意图展示封面问题，不是真实封面，这种核查方法也不合格。

这次已完成规则和历史草稿记录的核对，但**10 月 11 日微信草稿仍未修改**。封面会以最大化真实 TOC、兼容手机中心方形裁切、避免与完整原生标题重叠为标准；往期精选仍使用与论文主题相符的独立方形封面，不加重复性口号。按项目既定的反馈审批流程，在得到你的修改确认之前不覆盖微信草稿，不影响正文、DOI 链接或群发状态。
