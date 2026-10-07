# Phoenix editorial cover: source-exact structure correction

Beijing time: 2026-10-07 11:00:53 +08:00
Task: user requested removal of biomass material and verification of structures on both sides of the phoenix cover.

## User-visible commentary

“Biomass Wastes”、木屑、绿叶及“From waste…”这些无关元素都删掉。原文模型反应是**α-氯代苯乙酸乙酯 1 与苄基三甲基硅烷 2 偶联，生成 2,3-二苯基丙酸乙酯 3**，不是图中的生物质转化。 [Source: uploaded Nature Catalysis main article, Fig. 2 and lines 221–225.]

上一版下方 **11 和 5 还各多画了一个氮原子**，必须替换。此次保留凤凰意象，但清除旧结构和错误路径标注；化学部分直接叠加原文 Fig.2、Fig.3 的结构裁图，不让生成模型重画。 [Source: uploaded Nature Catalysis main article, Fig. 3a/e, page 5.]

先只修改背景：保留金色凤凰、深蓝山水和光感，移除全部旧文字、结构式、反应箭头及无关装饰。随后把已核对的原文结构作为独立图层叠加，保留原始键线、氮原子数、电荷和自由基位置。

## Actual QA and delivered artifact

The image generator again inserted unwanted scientific content despite the requested background-only edit. That candidate is NOT approved. Only its upper decorative phoenix artwork is reused; all generated diagrams, structures, taglines and legacy labels are discarded/occluded in the final deterministic composition.

The final image uses six intact rasters rendered from the user-supplied main article PDF, not generated chemistry:
- Fig. 2 substrate 1: ethyl 2-chloro-2-phenylacetate.
- Fig. 2 substrate 2: benzyltrimethylsilane.
- Fig. 2 product 3: ethyl 2,3-diphenylpropanoate.
- Fig. 3a phoenix1: original dimer linked by the C9–C9 single bond, one N-phenyl nitrogen in each acridine unit.
- Fig. 3a radical 11: one N-phenyl nitrogen, carbon-centered radical at C9.
- Fig. 3a cation 5: one N-phenyl nitrogen and the original cation/bond pattern. Counterion not invented; this source panel depicts the cation alone.

All original crops were visually inspected together, then the completed 1600×1600 composition was visually inspected. Structures are only cropped and uniformly scaled. No chemistry is reconstructed from text, RDKit or an image model. The identity-key row deliberately has no invented mechanism arrows.

Verified local final file: /mnt/data/phoenix_verified_cover.png
SHA256: 2153eba016166d9efdd55d38a57b8d1f974b9fee11dde4282a55bf20997abef1
Size: 634823 bytes
Provenance record: /mnt/data/phoenix-source-correction/final-provenance.json
Final visual QA: /mnt/data/phoenix-source-correction/final-QA.jpg

Display the corrected image and its sandbox file link. No claim of WeChat upload, approved draft, journal-official cover, or public publication. No publisher trigger was changed or invoked. The PNG itself is a conversation artifact, not a repository-pinned production asset.
