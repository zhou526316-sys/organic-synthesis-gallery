# 2026-10-14 — 全正式 DOI 正文双来源核对（**跨目录代次的比较报告，不是合并入库凭证**）

## 已实际完成的两项独立工作流

| 来源 | GitHub Actions | 正式 DOI | 来源核验 | 尚未导入正文 |
| --- | --- | ---: | --- | --- |
| Europe PMC OA JATS | [#38507374312](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38507374312) | 1087 | 47 篇 CC BY 且具有科学章节结构的**待复审候选**；其余状态另记 | 0 |
| OpenAlex Works 元数据/TEI 可用性 | [#38508560574](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38508560574) | 1087 | 1060 精确 DOI 匹配，20 not_found，7 metadata_doi_mismatch；368 标记 OA，222 标记存在 TEI；**未下载 TEI** | 0 |

OpenAlex 222 篇 TEI 元数据许可信号分组：`cc-by=99`，`cc-by-nc-nd=62`，`cc-by-nc=10`，空值49，`other-oa=2`。CC BY 也仅为元数据信号，不是出版社对文章逐条使用权的最终核验。限制性和未知授权项目不得复制到公共 FTS。

## 严格的目录代次差异

- Europe PMC 扫描目录：`f263e943427a16c8fa52c828d786fb90fc7366d6e01bd74e1b2b1bd148d69870`。
- OpenAlex 扫描目录：`1423102a4bb33e93d24693b89e8714062106f5309eacc3c3fef56876ca966b7c`。
- 比较证明：**1087 个 DOI 集合完全相同，每篇 revision 完全相同**，但 5 篇 JOC 的未来标注 `2026-10-15` 已被更正为无已核验首发日：
  - `10.1021/acs.joc.6c01159`
  - `10.1021/acs.joc.6c01506`
  - `10.1021/acs.joc.6c01769`
  - `10.1021/acs.joc.6c01792`
  - `10.1021/acs.joc.6c01796`
- **禁止**把不同 catalogId 的两个 source audit 按同代次累加并作为公共 FTS 的提交依据。下列 DOI 交叉计数只用于跨来源恢复任务优先级，全部保留各自 `catalogId`、`revision`、许可证和抓取来源，正式导入必须重新核对当时在线 catalogId。

## 交叉来源的探索性发现（不代表真正已抓取正文）

- 第一来源 47 个 OA-JATS 待审 DOI；第二来源存在 TEI 的 222 个 DOI。
- 两来源 DOI 交集 21，OpenAlex 新提供 **201 个未出现在第一来源 OA-JATS 候选中的 TEI 可用性线索**。
- OpenAlex 99 个 CC BY 信号 DOI 中，21 已在 Europe PMC 的47候选内，其余78是新的潜在合法再利用来源线索；探索性去重结果为 `47 + 78 = 125` 篇有 CC BY 信号的来源待审 DOI。**125 不等于 125 个科学章节已抓取，更不等于 125 篇可公共存储的最终授权全文。**
- OpenAlex 123 个非 CC BY 信号 TEI 条目需优先查明每篇真实许可能力，其中 72 个有 NC/ND 限制，不自动公开复制。
- 不能由 `TEI_available` 推断 GROBID 解析完整或准确，不能由某一来源 `not_found` 推断出版社没有正文。

## 下一阶段验收单元

1. 优先核查 99 条 CC BY 信号的出版社文章许可证及 DOI 身份，合法取得科学正文后按真实章、图注、表格核对；源许可证不可用或收费/订阅条目转本机有权访问的私人检索层。
2. Europe PMC 已有的 47 篇逐篇完成主文、SI相关科学主张与版权独立审核，保留结构 `complete_candidate` 和 `partial` 的差别。第一篇 Nature Chemistry `10.1038/s41557-026-02206-6` 已完成主文第二遍挑战，但 SI、逐节哈希与真正 FTS 导入仍待完成。
3. 当前无 TEI 的其余正式 DOI 继续走开放出版社网页／机构库／用户本机受权正文链路，不触碰历史 TOC-only、媒体图或私人 PDF 队列。
4. 正式在线目录若继续变更，来源与 FTS 导入的代次必须同一，重复源文不能仅凭另一期旧截图和相同标题通过。

逐篇证据文件：
- `audit/body-source-full/census-38507374312-f263e943427a.json`
- `audit/body-source-openalex/census-38508560574-1423102a4bb3.json`
- `audit/body-source-review/2026-10-14-openalex-tei-rights-queue.json`
- `audit/body-source-review/2026-10-14-all-formal-oa-review-worklist.json`

本报告不包含正文原文、PDF、SI、媒体图片或任何写入凭证；公共可检索科学正文仍按**实际 FTS 已导入数量**计数，不使用来源候选数替代。
