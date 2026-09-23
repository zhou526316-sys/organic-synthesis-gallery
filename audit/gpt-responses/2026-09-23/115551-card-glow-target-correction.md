# Card glow target correction

Beijing checkpoint time: 2026-09-23 11:55:51 +08:00.
User message: 光效粗细说的是卡片的光效，按钮不需要。
Context: Organic Synthesis Gallery UI/feedback continuation; explicit user correction supersedes earlier button-target assumptions.
PR147 current head: 5bf098d7cfb70bee03feca8ae953fddb33ea613e. Not merged or deployed by this chat.
Evidence: audit/ui-feedback/2026-09-23-115551-card-only-glow-checkpoint.json, committed as a1f9ef0f3272816e2b241e2202be5471714d2669.
Latest verification runs: card35816110874, originals35816110880, presentation35816110873, performance35816110941, quality35816110897. Observed in progress. Earlier original run35815578054 had15 passed/2 frame-change failures; no universal GIF failure claim.

## Progress replies

明确了：你要调的是整张文献卡片的环绕光效粗细，不是阅读状态按钮。我会纠正作用对象，移除按钮上的光效，保留按钮配色和图片文字显示。

这次把“光效样式”和“粗细”都改为控制卡片外沿，按钮与状态标签不再发光。原有设置会沿用到卡片上，控件名称也会明确写成“卡片光效”。

修复分支已改为卡片级光效，按钮和小标签上的装饰光效已移除。测试会检查整张卡片的光圈、按钮不发光，以及拖动粗细时卡片和按钮尺寸都不变。

卡片上的拖动、保存、重置和取消已通过复测，按钮也没有出现光效。还发现彩虹样式被普通边框样式覆盖，正在修正；原图/GIF 回归另有未通过项，因此暂未上线。

## Final response

对，是我之前把作用对象理解错了。**你要调的是整张文献卡片外沿的光效粗细，不是按钮。**

修复代码已按这个方向改好：光效样式和 **1–6px 粗细**都作用于卡片；按钮与状态小标签不再添加光效，保留原有配色、图片和状态文字。设置名称也已改成“卡片光效”“卡片光效粗细”，沿用已有设置，不需要重新配置一套。fileciteturn475file0L2-L2

**目前尚未上线。** 修改保存在 PR #147，最新提交为 `5bf098d`。卡片拖动、保存和重置已通过前一轮检查，但原图/GIF 动画检测仍有未通过项，最新复测尚未结束。fileciteturn475file0L2-L2
