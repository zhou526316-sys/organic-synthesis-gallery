# 2026-10-06 公众号纯图片审阅稿（WYSIWYG 最终完整性候选）

> 每张正文图均先实际裁成独立 raster，再由我查看最终像素结果。生产 manifest 不再包含 crop_frac，发布阶段禁止再次重裁。

# 今日精选｜Nature Chemistry

## 封面

- pinned asset: `public/wechat-assets/natchem-2026-10-06-cover-v2.jpg`
- WeChat 2.35:1 crop: `0_0_1_1`
- WeChat 1:1 crop: `0.287234_0_0.712766_1`
- 说明：今日精选使用已审核的 2.35:1 成品封面：上部为 Nature Chemistry 原文 Fig. 1e，底部为深蓝标题安全区，避免微信白字压在浅色反应图上。

## fig1

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-problem.png`
- intended placement: 文章开头：问题/全貌引入
- caption: 原文 Fig. 1e｜先看作者真正面对的失败模式：普通电解容易出现自由基过氧化、脱羧/脱硼副反应和电极钝化；交替极性虽然明显改善这些问题，但目标交叉偶联仍然很低，说明“让两类自由基同步生成”才是下一步核心。
- runtime crop_frac: none

## fig2_activation

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-redox-species.png`
- intended placement: 第三层｜两个反向实验把答案指向氧化电位 / 谁更容易被氧化，谁就先大量生成自由基，也就先和自己偶联
- caption: 原文 Fig. 2b｜TMAF 不是普通添加剂，而是在改前体的物种形态：羧酸变成约 0.8 V 可氧化的羧酸盐，硼酸则在适量氟离子下形成氧化电位接近的单氟/二氟硼酸盐；氟过量形成 BF₃ 物种后又重新失配。
- runtime crop_frac: none

## fig2_redox

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-redox-evidence.png`
- intended placement: 第四层｜TMAF 把两类前体调到同一个氧化窗口 / 它不是普通添加剂，而是在反应开始前先把两类前体“调到同一个频道”
- caption: 原文 Fig. 2d–f｜循环伏安与 ¹⁹F NMR 把“氧化还原匹配”变成可观测的证据：不同含氟硼物种的出现与氧化波移动相互对应，说明交叉选择性首先取决于前体物种与电位是否被调到同一窗口。
- runtime crop_frac: none

## fig3_electrode

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-electrode.png`
- intended placement: 第六层｜电极和波形分别控制不同失败通道 / 一个控制“别把自由基继续氧化”，另一个控制“电极别越做越死”
- caption: 原文 Fig. 3a–c｜电极材料与波形负责两个不同失败通道：碳电极把自由基进一步氧化推到更高电位；交替极性的还原半周期则帮助抑制电极持续钝化。
- runtime crop_frac: none

## fig3_mechanism

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-mechanism.png`
- intended placement: 第七层｜最终的交叉选择性从哪里来 / 这里没有一个催化剂在“认人”，而是把两个自由基的瞬时浓度调到接近
- caption: 原文 Fig. 3d｜作者提出的整体图景：两类被调到相近氧化窗口的前体分别生成短寿命自由基；当两边生成通量接近时，交叉偶联才有机会压过各自的自偶联与过氧化通道。
- runtime crop_frac: none

## fig4_scope

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-scope.png`
- intended placement: 第九层｜底物拓展：方法学到底能走多远 / 从直链到底物骨架更复杂的片段，真正展示的是这套“自由基通量匹配”能否离开模型体系
- caption: 原文 Fig. 4a（底物拓展局部）｜方法并不只适用于模型底物：线性脂肪链、酯、烯烃、缩醛/醚、环烷基、芳基氟以及较拥挤的萜类骨架都能进入这类 C(sp³)–C(sp³) 偶联。不同底物收率差异也提醒我们，物种平衡和自由基生成速度仍然是适用边界。
- runtime crop_frac: none

## fig4_tandem

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/daily-diversification.png`
- intended placement: 第十层｜合成上真正买来了什么 / 从底物拓展继续往前走，这一步还可以接到更长的合成路线里
- caption: 原文 Fig. 4b｜合成价值不仅是“做出一个偶联产物”：电解先拼出新的烷基–烷基骨架，保留下来的芳基卤素还可以继续接 Suzuki–Miyaura 或 Buchwald–Hartwig 等后续转化，把这一步变成复杂化的前端模块。
- runtime crop_frac: none


---

# 往期精选｜Nature｜Hyster

## 封面

- pinned asset: `public/wechat-assets/hyster-plp-photoenzyme-retrospective-cover.jpg`
- WeChat 2.35:1 crop: `0_0.287234_1_0.712766`
- WeChat 1:1 crop: `0_0_1_1`
- 说明：使用用户确认的蓝色 FRET/PLP* 往期精选封面原图；发布脚本只做尺寸标准化，不重新设计。

## fig1

- pinned asset: `public/wechat-assets/hyster-fig1c-overview.png`
- intended placement: 文章开头：问题/全貌引入
- caption: 原文 Fig. 1c｜先把整篇工作的逻辑放在一张图里看：左侧是不对称自由基–自由基偶联；中间是 Rh6G 吸光并通过 FRET 把能量交给酶内醌式 PLP；右侧光谱说明这个中间体为什么有机会被“点亮”。
- runtime crop_frac: none

## fig2_evolution

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-evolution.png`
- intended placement: 第三层｜先看蛋白工程：从 5% 到 90% 到底改了什么 / 野生型已经“会选方向”，定向进化主要把一次漂亮但低效的反应变成可用的方法
- caption: 原文 Fig. 2b｜野生型 TmLTA 只有约 5% 收率，却已经给出 99:1 e.r.；五轮定向进化把收率推进到约 90%，高对映选择性基本保持。换句话说，最初就已经“会选方向”，后续主要是在把有效反应事件做多。
- runtime crop_frac: none

## fig3_scope_pyrimidine

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-scope-pyrimidine.png`
- intended placement: 第四层｜工程化以后，底物拓展告诉了我们什么 / 真正有价值的不是一张“产物墙”，而是看哪些结构变化仍能保住活性与手性
- caption: 原文 Fig. 3（嘧啶系列）｜不同杂芳环取代与多类自由基前体都能进入反应，但收率与 e.r. 会随取代位置、电子效应和自由基结构明显变化。底物表不是“成绩单”，而是在画出酶口袋和光化学共同允许的空间。
- runtime crop_frac: none

## fig3_scope_pyridine

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-scope-pyridine.png`
- intended placement: 第四层｜工程化以后，底物拓展告诉了我们什么 / 真正有价值的不是一张“产物墙”，而是看哪些结构变化仍能保住活性与手性
- caption: 原文 Fig. 3（吡啶系列）｜把体系推进到更难形成醌式中间体的吡啶底物后，作者需要提高胺用量并再做一轮定向进化；部分底物仍能保持很高 e.r.，但 6-位取代等情况明显暴露出活性和立体控制的边界。
- runtime crop_frac: none

## fig4_external

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-fret-external.png`
- intended placement: 第六层｜怎么知道外源 FRET 真的发生了 / 要证明“递能量”，要把淬灭、光谱重叠和反应结果放在一起看
- caption: 原文 Fig. 4b–c｜外源 FRET 的两条关键证据：含醌式中间体的酶复合物能够动态淬灭 Rh6G 激发态；Rh6G 的发射又与 [Q] 的吸收明显重叠。两者合在一起支持“天线把能量交给 PLP”的路径。
- runtime crop_frac: none

## fig4_internal

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-fret-internal.png`
- intended placement: 第七层｜更有意思的是，酶自己也能当“能量线路” / 去掉罗丹明以后，外亚胺也能把能量跨活性位点传给醌式中间体
- caption: 原文 Fig. 4d–e｜去掉 Rh6G 后，外亚胺 [A]* 仍可向同一 TmLTA 四聚体中邻近活性位点的 [Q] 传能；3–5 nm 的活性位点间距正好落在 FRET 常见的工作尺度内。
- runtime crop_frac: none

## fig5_mechanism

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-mechanism.png`
- intended placement: 第八层｜第二道难题：两个瞬态自由基怎样实现 99:1 的对映选择性 / 不是让一个自由基变得持久，而是让两个自由基在同一个手性口袋附近同时出生
- caption: 原文 Fig. 5f｜完整循环把整篇文章串起来：形成醌式中间体 → FRET 得到 [Q]* → 单电子还原自由基前体 → 半醌自由基与碳自由基在酶内共生成 → C–C 成键并建立手性。
- runtime crop_frac: none

## fig5_lifetime_ab

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-lifetime-ab.png`
- intended placement: 第九层｜激发态 PLP 真的有能力完成这次还原吗 / 寿命、荧光淬灭和氧化还原能力从三个方向把 [Q]* 锁定为关键物种
- caption: 原文 Fig. 5a–b｜吡啶鎓底物能够淬灭 [Q]*；时间分辨荧光显示工程化酶中与反应相关的长寿命激发态分量明显增加，已经进入纳秒尺度，为分子间电子转移留下时间窗口。
- runtime crop_frac: none

## fig5_application

- pinned asset: `public/wechat-assets/reviewed/2026-10-06/hyster-application.png`
- intended placement: 第十二层｜为什么 Lenacapavir 核心值得放在最后 / 它把“建立新的 C–C 键”和“建立手性胺中心”压缩进同一步
- caption: 原文 Fig. 5g｜Lenacapavir 核心片段应用：一步同时建立新的 C–C 键和手性胺中心，得到 82% 分析收率、98:2 e.r.；这里真正展示的是新的逆合成入口，而不是把单次结果直接等同于成熟工艺。
- runtime crop_frac: none


## 最终视觉检查标准

- 开头图必须与开头文字直接对应，不以孤立小 panel 充当首图。
- 图中结构、条件、坐标轴、图例和 panel 标号不得被截断，也不得带入半截相邻 panel。
- 底物拓展不是装饰：必须保留能判断结构变化与产率/e.r. 的信息。
- 机理、范围、应用交替出现，避免连续多屏纯文字；但不机械执行“一段一图”。
- 同一图片只服务一个核心论点，不重复占位。
