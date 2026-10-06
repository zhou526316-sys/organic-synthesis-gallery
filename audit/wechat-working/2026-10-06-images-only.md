# 2026-10-06 公众号纯图片审阅稿（所见即所得终版）

> 最终生产稿不再包含任何 `source_url + crop_frac` 动态裁切。正文图全部已经先物化成独立 PNG/JPEG、逐张查看，再固定为 repo_path。微信写入阶段只上传这些已审核 raster。

## 硬性审核规则

- 结构、箭头、坐标轴、图例、panel 标签不得被切断。
- 不得露出相邻 panel 的半截内容。
- 底物拓展按完整逻辑块展示，不为缩小尺寸硬切成碎片。
- 一张图只承担一个明确叙事任务，图注只描述实际可见内容。
- 今日精选开场改用完整 Fig. 1e 问题图，不再孤立展示 Fig. 1c。
- 往期精选保留用户确认的蓝色 FRET/PLP* 封面和完整 Fig. 1c 总览。

# 今日精选｜Nature Chemistry

## cover_final（封面/非正文）

- repo_path: `public/wechat-assets/natchem-2026-10-06-cover-v2.jpg`
- intended placement: 仅封面
- caption: 
- review basis: pinned repository asset, directly inspected

## fig1

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-problem.png`
- intended placement: 正文开头/开篇视觉锚点
- caption: 原文 Fig. 1e｜先看作者真正面对的问题：羧酸与硼酸都能产生瞬态烷基自由基，但在普通条件下会同时出现自偶联、过氧化、质子脱硼和脱羧等竞争通道。交替极性电解先压住一部分失活路径，后面的“氧化还原匹配”才有意义。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-problem.jpg`

## fig2_activation

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-redox-species.png`
- intended placement: 谁更容易被氧化，谁就先大量生成自由基，也就先和自己偶联
- caption: 原文 Fig. 2b｜TMAF 不是普通电解质，而是在同时改变两类前体的物种形态：羧酸变成约 0.8 V 可氧化的羧酸盐，硼酸则经过单氟/二氟硼物种进入相近氧化窗口；氟过量形成 BF₃ 物种后又重新失配。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-redox-species.jpg`

## fig2_redox

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-redox-evidence.png`
- intended placement: 它不是普通添加剂，而是在反应开始前先把两类前体“调到同一个频道”
- caption: 原文 Fig. 2d–f｜循环伏安与 ¹⁹F NMR 把“匹配”从概念变成可观察证据：不同 TMAF 用量改变硼物种分布，也同步改变氧化波位置。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-redox-evidence.jpg`

## fig3_electrode

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-electrode.png`
- intended placement: 一个控制“别把自由基继续氧化”，另一个控制“电极别越做越死”
- caption: 原文 Fig. 3a–c｜电极材料和交替极性解决的是不同问题：碳电极提高自由基继续被氧化的门槛，反向半周期则缓解表面钝化，使自由基生成可以持续。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-electrode.jpg`

## fig3_mechanism

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-mechanism.png`
- intended placement: 这里没有一个催化剂在“认人”，而是把两个自由基的瞬时浓度调到接近
- caption: 原文 Fig. 3d｜作者提出的整体图景：两类活化前体在相近电位被氧化，两个瞬态自由基以相近通量出现；交叉偶联与两种自偶联因而接近统计性的 2:1:1。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-mechanism.jpg`

## fig4_scope

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-scope.png`
- intended placement: 从“两个自由基能不能同步”走到“不同烷基片段能不能真的接起来”
- caption: 原文 Fig. 4a（底物/原料范围）｜不同烷基片段和官能团能够进入这套 C(sp³)–C(sp³) 连接逻辑，说明方法的价值不只停留在模型底物；同时，收率差异也提醒我们这仍是受自由基生成速率与前体物种平衡约束的方法。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-scope.jpg`

## fig4_tandem

- repo_path: `public/wechat-assets/reviewed/2026-10-06/daily-diversification.png`
- intended placement: 从硼酸继续向上游追到烯烃，再把产物接回传统偶联，才是这套方法真正的合成价值
- caption: 原文 Fig. 4b（后续复杂化）｜电解先把两个 sp³ 片段接起来，保留下来的芳基卤素再进入 Suzuki–Miyaura 或 Buchwald–Hartwig 反应，展示这一步作为“前端拼骨架模块”的价值。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/daily-diversification.jpg`


---

# 往期精选｜Nature｜Hyster

## abstract_cover（封面/非正文）

- repo_path: `public/wechat-assets/hyster-plp-photoenzyme-retrospective-cover.jpg`
- intended placement: 仅封面
- caption: 
- review basis: pinned repository asset, directly inspected

## fig1

- repo_path: `public/wechat-assets/hyster-fig1c-overview.png`
- intended placement: 正文开头/开篇视觉锚点
- caption: 原文 Fig. 1c｜左侧是本文的不对称自由基–自由基交叉偶联；中间给出 Rh6G 吸光后向酶内醌式 PLP 发生 FRET 的设计；右侧吸收光谱展示该 PLP 中间体的可见光吸收特征。
- review basis: pinned repository asset, directly inspected

## fig2_evolution

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-evolution.png`
- intended placement: 野生型已经“会选方向”，定向进化主要把一次漂亮但低效的反应变成可用的方法
- caption: 原文 Fig. 2b｜野生型 TmLTA 只有约 5% 收率，却已经给出 99:1 e.r.；五轮定向进化把效率推到约 90%，而高对映选择性基本保持。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-evolution.jpg`

## fig3_scope_pyrimidine

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-scope-pyrimidine.png`
- intended placement: 真正有价值的不是一张“产物墙”，而是看哪些结构变化仍能保住活性与手性
- caption: 原文 Fig. 3（上半）｜嘧啶系列展示了这套光酶自由基–自由基偶联的主要底物空间：多种环上取代和不同苄基自由基前体都能进入反应，但产率与选择性并非完全均一。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-scope-pyrimidine.jpg`

## fig3_scope_pyridine

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-scope-pyridine.png`
- intended placement: 真正有价值的不是一张“产物墙”，而是看哪些结构变化仍能保住活性与手性
- caption: 原文 Fig. 3（下半）｜进一步走到吡啶底物后，方法仍能工作，但某些位阻更大的底物开始明显损失活性或立体控制，直接显示了当前酶口袋的边界。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-scope-pyridine.jpg`

## fig4_external

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-fret-external.png`
- intended placement: 要证明“递能量”，要把淬灭、光谱重叠和反应结果放在一起看
- caption: 原文 Fig. 4b–c｜外源 FRET 的核心证据组合：Rh6G 激发态被醌式中间体动态淬灭，同时供体发射与受体吸收有明显光谱重叠。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-fret-external.jpg`

## fig4_internal

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-fret-internal.png`
- intended placement: 去掉罗丹明以后，外亚胺也能把能量跨活性位点传给醌式中间体
- caption: 原文 Fig. 4d–e｜没有 Rh6G 时仍存在另一条能量路径：外亚胺 [A]* 可向同一 TmLTA 四聚体邻近活性位点中的 [Q] 传能；3–5 nm 的空间距离落在典型 FRET 尺度。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-fret-internal.jpg`

## fig5_mechanism

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-mechanism.png`
- intended placement: 不是让一个自由基变得持久，而是让两个自由基在同一个手性口袋附近同时出生
- caption: 原文 Fig. 5f｜完整循环把全文串起来：形成醌式中间体 → FRET 得到 [Q]* → 单电子还原吡啶鎓盐 → 在酶口袋附近共生成两个自由基 → 受控 C–C 成键。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-mechanism.jpg`

## fig5_lifetime_ab

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-lifetime-ab.png`
- intended placement: 寿命、荧光淬灭和氧化还原能力从三个方向把 [Q]* 锁定为关键物种
- caption: 原文 Fig. 5a–b｜吡啶鎓盐能够淬灭 [Q]*；时间分辨实验显示，工程化 EQLSL 中与反应相关的长寿命激发态分量显著增加，慢分量寿命约 3.6 ns。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-lifetime-ab.jpg`

## fig5_application

- repo_path: `public/wechat-assets/reviewed/2026-10-06/hyster-application.png`
- intended placement: 它把“建立新的 C–C 键”和“建立手性胺中心”压缩进同一步
- caption: 原文 Fig. 5g｜Lenacapavir 核心片段应用：单步同时建立新的 C–C 键和手性胺中心，得到 82% 分析收率和 98:2 e.r.；它更重要的是展示新的逆合成断键，而不是宣称已经完成工艺化。
- crop proof: `audit/wechat-working/crop-proofs/2026-10-06/hyster-application.jpg`

