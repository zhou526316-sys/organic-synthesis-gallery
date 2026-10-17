# Gallery ACS mobile original-link diagnosis
Beijing time: 2026-10-17 09:41:52 CST
Conversation/task: Mobile 打开原文 404; ACS DOI 10.1021/jacs.6c17862.
Status: read-only diagnosis; repair awaiting user approval by PROJECT_RULES.md.

## Verified evidence
- User reports Crossref-registered long ACS /jacsat/article/doi/ link returned 404 on mobile off campus, but ACS canonical short https://pubs.acs.org/doi/10.1021/jacs.6c17862 works.
- Crossref resource.primary.URL is the same long ACS link; registration/published date 2026-10-16.
- Current main src/main.ts derives href from shared/publisher-article-link.mjs for both DOI and 打开原文, and the PDF fallback.
- publisherArticleHref special-cases certain Nature DOIs, but ACS currently returns https://doi.org/<canonical DOI>.

## Proposed change (NOT APPROVED OR IMPLEMENTED)
For verified ACS DOI 10.1021/*, use https://pubs.acs.org/doi/<canonical DOI>. Preserve other routes and DOI identity. Test JACS, ACS Catalysis, Org Lett, non-ACS, Nature. Approval required before modifying code/merging/deploying.

## User-visible response (partial)
问题基本定位了。
**ACS 的短链接可以打开，而 Crossref 登记的新版长链接在你手机上返回 404。** 这说明问题不是没有连接校园网，而是 ACS 新版文章路径的访问兼容性。
对于这篇 JACS 论文，Gallery 应优先使用：https://pubs.acs.org/doi/10.1021/jacs.6c17862
而不是依赖 DOI 自动跳转到那条较长的 /jacsat/article/doi/... 地址。
我接着检查 Gallery 的链接生成逻辑，将这一修复推广到 ACS 期刊，并增加回归测试，避免其他 JACS、Organic Letters、ACS Catalysis 等论文出现相同问题。

## User-visible response (final)
核查完成：Gallery 对 ACS 的 DOI 文本与“打开原文”按钮仍默认使用 doi.org 中转。Crossref 登记的目标正是你手机上返回 404 的长地址，而你已确认 ACS 标准短地址可以打开。
**建议修复**：对 ACS 10.1021/* DOI 直接使用 https://pubs.acs.org/doi/<DOI>，同时覆盖 DOI 文本、打开原文按钮和 PDF 出错后的出版社回退链接；不改论文 DOI 和文献数据库，添加 JACS、Organic Letters、ACS Catalysis 回归测试。
按照你此前确定的项目规则，反馈问题需要先核实、由你批准后再改动。**目前只有诊断，没有修改或上线代码。** 如批准，请回复“批准修复 ACS 原文链接”。
