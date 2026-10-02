# 2026-10-02 13:08 Asia/Shanghai — 范围纠错与图片判别接续

## 完整用户回报

这次确实暴露了两种不同的问题：**文献范围判断过宽，以及媒体链路把“有图”和“官方 TOC 齐全”混在一起。** 我已继续核查，并把更谨慎的判断要求写进主审核每轮必读的范围契约，而不是只在聊天里提醒。

### 1. 微胶囊论文：已完成实际下线

`10.1038/s44160-026-01164-8` 已通过 deletion-only 事务删除，部署和线上验收均成功。北京时间 **10 月 2 日 13:03:14** 的回执确认生产集合由 **755 篇变为754篇**，移除的只有这篇；CCS 那篇仍保留。执行运行号为 `36966791981`。fileciteturn126file0

这篇确实有界面酰胺化和聚酰胺膜形成，但其主要贡献是微胶囊制备、载荷封装及微反应器功能。**我此前把这些真实化学操作当成了足够的有机合成方法学贡献，这个判断不对。** 出版社摘要支持你指出的边界。citeturn789406view0

### 2. CCS 图片：已经定位到可复现的判别缺陷

`10.31635/ccschem.026.202507094` 的实际卡片截图、图片文件和抓取记录已核对：主图与正文小图使用同一张 EPR 谱图，记录的图注是 **“Figure 1 | The EPR experiment.”**，抓取类型为 `figure1`，并非 `official`。fileciteturn131file0

更关键的是，发布端的 `sanitize-static-media.mjs` **只要看到图片可用，就把它计为 TOC 已存储**。我用与 main 的 Blob SHA 一致、未经修改的原脚本，在隔离目录实际复现了这一变化：

`figure1_fallback + tocMissing=true` → `complete + tocStored=true + tocMissing=false`

脚本退出码仍然是0。这正说明：**文件检查成功，不代表图片角色判断正确。** 这个错误发生在后处理的完整性标记中；不能据此断言最初抓取时发生了跨论文串图。fileciteturn129file0 fileciteturn131file0

目前还没有取得出版社页面的独立证据来确认该图的归属和正确官方 TOC，因此我没有把“它来自另一篇论文”写成结论，也没有随便换成另一张反应图。图片修复尚未部署，原始证据已保存。fileciteturn131file0

### 3. 后续判断要求已经收紧，但不靠一刀切

范围契约已更新为 **`scope-2026-10-02-v1`**，本次新增的关键要求是：

- **纳入必须分别回答“主要贡献是什么”和“可迁移的制备能力是什么”。** TOF、循环次数、膜厚、胶囊尺寸或载荷兼容性，不能替代底物—产物范围证据。
- **pending 转 include 必须真正补上原来缺的证据。** 不能因为拿到了更长的摘要，或新增了性能数据，就把仍未解决的制备证据缺口关闭。
- **范围判断、图片归属、官方 TOC 身份和线上交付分开核验。** CI、哈希和 DOI 集合检查各自通过，不等于学术判断和图片语义也正确；Figure 1 替代图不能被计作官方 TOC 齐全。fileciteturn132file0

规则提交为 `ac7f7f0a`，图片核查记录提交为 `3f79f2e3`。这次没有改定时任务，没有扩大成整类禁收，也没有宣称全站已经排查完成。

**CCS 这项拟按以下范围修复：隔离这张 EPR 图的卡片主图用途，保留论文和原始证据；纠正 fallback 被算作 TOC 齐全的逻辑，再由 Tampermonkey/VPN Bridge 核验并补抓官方 TOC。是否批准这项媒体修复？**

## 过程说明同步

- “我继续处理这两项。微胶囊论文按你明确的范围决定执行删除，并核验线上确实消失；CCS 那篇先核对卡片实际显示的图片、来源 DOI 和原始抓取记录，不能只凭‘下载成功’认定图片正确。后续也要把文献范围判断、图片身份核验和上线验收分开，避免程序检查通过却仍然误收、错配。”
- “CCS 出版社页面的独立浏览器核验因工具余额不足而未启动，充值入口已显示在工具卡片中。是否充值继续这条核验通道？我不会重复调用它；本轮继续读取已取得的 GitHub 截图、抓取记录和正在运行的下线流程，也不会把尚未核实的图片归属写成确定结论。”

## 追溯信息与执行边界

用户请求：以后抓取和上线的判别机制还是要再谨慎一些。继续。

本轮开始 main=42e3044a7e1222abe5ff72a031130d105449e3c1；发现上轮失败之后现有修复运行36966791981已在进行，未取消、重启或重复提交删除请求。随后读取到该运行correction、authorization、build、deploy、record_delivery全部成功。下线marker commit=284af5392fa418e5edde6a9a940b3038eb9bc6d3，marker blob=72f076bad2efc074270a88f3dee193cfdd81b559，receipt blob=5f291793fb4a1d7a2de07a357d7d29997fbdc4ce，数据摘要=0dd1605cb024b5b63a1f129cdf7250c090e81e71747e9ade8056a4ca20097beb。当前回执证明的是实际HTTP数据交付；不要表述为本轮另做了754篇逐篇审核。

本轮规则修改：docs/literature-scope-contract.md，旧blob=f3102cd8a21d5b9dcd31a4f8d7d1a19e3c4e89e8，新blob=d7e163da1167917d2d6e9b9ba4d070b46e6253e5，提交ac7f7f0a5c89a983d0c2f027bde86b54a68569e6。已完成微胶囊DOI依据核查；未声称所有受影响旧include已挑战。新契约要求下轮对受影响旧依据进行具体兼容性复核，不无差别重抓全站。

图片诊断：既有GitHub run=36966595869，artifact=11210495514，截图/数据实际下载并读取；本轮仅检查Gallery已存文件，未下载/发布新的出版社图。对应当前sanitize脚本blob=65eb166b318017021259ecac4c7726d45bbae315，已用Git blob算法与artifact中脚本字节一致性核对，再运行原脚本完成隔离复现。不是修复代码、不是生产写入，也没有用本地复现代替要求在GitHub执行的正式预发布门检。本轮不是固定槽主审核任务。

媒体取证和待批准方案：audit/media-rechecks/2026-10-02-ccschem-202507094-role-and-inventory.json，blob=bd87c904ed8e4c200a071be818488666e63adbca，提交3f79f2e33205f6fa243e2f255cf24482e8db3250。注意上游queue已保留fallback_only，不能称所有消费者均误判、不能称已查明缺官方TOC的原始原因。图片归属未独立验证；本轮未实施媒体修复代码、未改媒体生产数据、未触发抓取。PROJECT_RULES.md要求明确批准该项修复后才能实施，“继续”不自动解除此门禁。

来源：
- Nature Synthesis publisher preview: https://www.nature.com/articles/s44160-026-01164-8 （本轮实际读取摘要和图注；未把订阅预览称为全文/SI）
- GitHub run: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/36966791981
- Scope receipt: audit/scope-removal-delivery-latest.json at 9c512d2efcf05a11efa7830fb08f76b5b8c53b72
- Media evidence: audit/media-rechecks/2026-10-02-ccschem-202507094-role-and-inventory.json at 3f79f2e33205f6fa243e2f255cf24482e8db3250

网络限制如实保留：CCS DOI/full/abs web读取均为工具内部错误；TinyFish未启动且未重试，不算出版社实查；容器直连GitHub的后备只读GET因DNS失败而未取得数据，后续仍由实际GitHub connector完成仓库读取。上述局部限制不阻断已完成下线运行的证据读取，也不被用来编造图片身份。
