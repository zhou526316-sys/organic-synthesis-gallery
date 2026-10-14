# 历史回溯续作：Nature Chemistry 66 DOI，51篇审核、3篇学术纳入、Q3复算11,289

- 北京时间归档：2026-10-14T17:47:08 +08:00
- 项目主线：`zhou526316-sys/organic-synthesis-gallery`，`main` 唯一代码基线。
- 用户请求：“继续”。承接 PR #654 成功及正式Q3计数11,340，在 Nature Chemistry 实际审核和发生历史 source queue 文件SHA动态变化时严守源证据验证。
- 所有数据以Git源和实际staging-only工作流为准，不以预测或CI代替真实入库。

## DOI原始研究与出版社来源核查

Nature Chemistry 2026年7月1日至9月30日，官方2026 online Articles索引分页第1至4页，包括 **66条首发 Q3 DOI，其中37篇Article、29条非原创栏目**。全66 DOI、出版社在线日期与旧Crossref/OpenAlex Q3 source roots中的66条一致，没有发现所列官方分页内的漏抓或日期不一致。该检查不构成整个16刊 Research issue或潜在off-index online-first完全覆盖的声称。

原正式目录已经有13篇，原出版商非原创审核2条；本轮逐篇完成51条：**27条进一步确认的News & Views/Comment/Review等非原创**, **20篇真正原创Article但以物理、材料、无机界面催化等为主要贡献而超出站点通用有机制备范围**, **1篇需要追加分离制备证据的Pd触发苯丙氨酸去保护研究** `10.1038/s41557-026-02226-2`，以及**3篇经两遍科学论证确认有一般制备贡献的原始研究**：
1. `10.1038/s41557-026-02228-0`，首发2026-08-26，多类发色团荧光氨基酸构筑及Fmoc固相肽合成。
2. `10.1038/s41557-026-02227-1`，首发2026-08-28，环丙醇可电化学触发的选择性蛋白共价生物偶联，不将蛋白质组学结果或标记数据冒充小分子分离收率。
3. `10.1038/s41557-026-02232-4`，首发2026-09-02，N-羟基邻苯二甲酰亚胺引发聚甲基丙烯酸酯主链HAT裂解与低温本体解聚，约90%回收可分离原始单体；无“适用所有塑料”的夸大。

三篇各有出版社 DOI 精确出处、真实在线日期、完整现有作者顺序、中文卡片标题、独立第一遍和反向挑战、原始批次SHA-256及Git SHA，不编造正式卷页。总历史批准从116变为119，原两篇发表日期冲突待核不变。三篇均未由当前对话正式上网，只可通过北京时间唯一08:00发布槽。

## 实际完成合并

- [PR #656 Nature Chemistry完整证据和学术审核](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/656)，合并 commit `47a267bc89951d38605afd5f6c70c498a940503a`，七类CI通过。
- [PR #657 12个来源根与51篇新审子集仅11个来源根的校验修复](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/657)，commit `1a047bae08aeccd4b9318ced58c601370060c029`。按真实66全部DOI的12个根与新审51篇的11个根分别校验，不能硬把子集等同全量。
- [PR #659 合法审核状态改变后仍保持不可变批次核验的reviewer Git SHA修复](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/659)，commit `abf38fd6a3bbadd3fef8e8201d2c26c5237194f4`，所有五类CI通过。只在原始source batch SHA-256和Git SHA-1不变、用当前正式/学术已批/待核DOI确定性重建完整reviewer-shard且所有内容精确匹配后，允许原审计所钉的旧Git SHA作为其原来源根的历史凭证；保持当前新Git SHA与旧值分别记录，严禁无条件放宽哈希。

## 失败重试与成功复算——明确区别

- 初次staging-only [#38538114410](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38538114410) **FAILURE**：错误要求“51篇子集对应全部12个来源根”。
- 二次 [#38539425019](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38539425019) **FAILURE**：`q3_nonresearch_publisher_evidence_invalid:10.1038/s41557-026-02234-2`，因为同一review-queue文件夹内两个新的方法学DOI经授权进入manifest后，其状态由requires_two_pass_review变为two_pass_approved_awaiting_08，整份可重算reviewer-shard Git SHA变化。原始期刊source batch没有变化。以上失败均未覆盖历史季度报表。
- 严格修复后 existing staging-only [#38544450233](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38544450233) **SUCCESS**，两份季度报表实际从staging读回且 `generatedAt` 共同为 `2026-10-14T09:43:53.455Z`（北京时间17:43:53）。
- `audit/historical-staging/quarter-2026-q3-coverage.json` Git blob SHA **`8d65267548c3698fe2834a5630b0c13e68c2c46a`**。
- `audit/historical-staging/quarter-2026-q3-review-worklist.json` Git blob SHA **`1111a09699e30bff5f1c9c4da478e5b5642a118f`**。
- 原始历史来源状态文件 `audit/historical-staging/state.json` SHA `99bac92a5c965c395c4e0bae63df823a09fc646d`，未被篡改；源文章总数12,286未降。
- 原始Nature Chemistry 2026-08-22至08-31 batch SHA `ec90ee5eaa30aee408fb2bce7753066ebf8b7478` **不变**；其中review-queue Git blob从 `61ab3a6c32154c2e3948cb26d92eadac139d101a` 到 `0bedbe2975e4cce14f5f39d2dab4ed559905992a`，是两个获准的同根DOI状态变化造成，且重建经完整源批次双哈希验证，不代表来源DOI变了。

## Q3真实数字

| Q3核验指标 | 此轮前 | 此轮后 |
| --- | ---: | ---: |
| 16刊去重Crossref/OpenAlex来源DOI | 12,286 | 12,286 |
| 原始来源窗口完成 | 192/192 | 192/192 |
| 当前正式收录Q3 | 820 | 820 |
| 历史学术批准累计 | 116 | 119 |
| 学术已审待明日唯一08:00入库 | 25 | 28 |
| 出版社非原创排除 | 55 | 82 |
| 原创范围排除 | 29 | 49 |
| 追加科学证据待核 | 4 | 5 |
| 未完成审核/日期核验候选 | **11,340** | **11,289** |

Nature Chemistry Q3已知来源66：13 formal、3 accepted awaiting08、29 non-original、20 scope-excluded original、1 science-pending original、**zero known DOI unfinished**。7月24来源(6正式+13非原创+5排除)，8月16来源(4正式+6非原创+4排除+2待入库)，9月26来源(3正式+10非原创+11排除+1待入库+1证据待核)。

追加五篇科学待核是：Nature Catalysis `10.1038/s41929-026-01608-6` 和 `10.1038/s41929-026-01611-x`；Nature Synthesis `10.1038/s44160-026-01115-3`、`10.1038/s44160-026-01146-w`；Nature Chemistry `10.1038/s41557-026-02226-2`。这五篇与学术准入manifest中原2篇首发日期争议待核分开统计。

## 质量与权限边界

- 仅北京时间08:00正式新增，取消18:00不补发；历史补录绝不进入Today/Hot/公众号每日新增。7月1日至9月30日旧文章只TOC-only，不新增正文/SI/PDF/正文图；7月前metadata-only。
- 本轮不调用生产Cloudflare D1，不批量获取受限出版社HTML/全文，不更改用户永久排除12 DOI，不改变任何正式目录中的文章。
- 历史批准118之前原审核后新3增至119，正式目录1087、正式Q3 820仍不变。
- 16刊出版社逐期 Research 和 online-first 完整性标志继续 false；“192/192元数据来源抓取”和“三本Nature子刊已知来源 DOI 分类完整”不能代替出版社Recall最终验收。
- 下一阶段对仍未完成11,289条候选跨刊作高召回论文发现和出版社首发核验；不能为了降低候选数量搞关键词自动排除。

跟踪Issue #498本轮回读：[评论 #6165537994](https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6165537994)。
