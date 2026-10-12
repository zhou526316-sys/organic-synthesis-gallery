# 历史文献轻量化全文检索：批准后的第一阶段实施结果

- 北京时间：2026-10-12 12:50:25（Asia/Shanghai）
- 仓库：zhou526316-sys/organic-synthesis-gallery；main 唯一生产基线
- PR：https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/545
- 工作分支：feat/historical-text-search-pilot-20261012
- 工作分支最后一次读到的 HEAD：e980b3563e97af73acc718cd57f9fbd49ec6cabc
- 已批准范围：官方开放全文优先；Tampermonkey 对合法授权的旧论文进行独立正文文本补缺；不保存2026-10-01前旧PDF；先跨期刊50–100篇小试。
- 真实状态：代码已提交PR，尚未合并、未部署；没有真实出版社全文的50篇采集，也没有把正文接入生产公开全文检索。
- 专项CI：https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38205294778 ，已完成并成功；6/6独立测试通过，按已批准正式历史DOI抽50，涉及14本期刊；dry-run中PDF请求、正文网络请求、生产数据库写入均为0。
- 其余质量门禁：生产API smoke、Worker dry-run、历史专项与基础验证通过；Playwright、完整构建、两类媒体回归当时尚在运行，禁止无通过证据合并。
- 历史 source metadata 的50-DOI真实OpenAlex查询计划在合并后由受控单次push触发；本次未执行，不虚报TEI或许可覆盖结果。
- 关键文件：scripts/historical-text-source-audit.mjs, scripts/historical-text-local-evaluator.mjs, scripts/test-historical-text-search-pilot.mjs, public/gallery-historical-text-pilot.user.js, .github/workflows/historical-text-search-pilot.yml, docs/historical-text-search-pilot.md, docs/historical-backfill-media-contract.md。
- 旧媒体生产规则：保留2026-07前metadata_only及7-9月toc_only；历史正文补缺仅为人工确认权利的本机文本试验；10月后PDF/图片与北京时间唯一08:00正式文献发布不受影响。
- 原本“标题+摘要”检索现状不代表正文已全面索引，测试中的bodyOnlyHits只比较本地试验样本的标题+Abstract与全文，不冒充正式站点召回率变化。
- 公共站点版权门禁：下载TEI/PDF资源存在不等于可将全文给全站检索用户公开，须先核对每篇实际授权、版本与展示规则。
- 生产验收缺项：CI综合质量门禁、merge与Pages真实部署、50份OpenAlex来源审计、Tampermonkey原始真实浏览器采集、版权审查、可运行的D1 FTS章节检索接入（后期独立实现）；未取得证据不可称完成。
- 来源说明：OpenAlex fulltext https://help.openalex.org/access/fulltext/ 保留原文版权，不授予新增内容权利。

## 本轮已经向用户发送的可见部分

已按批准方案开始实施，代码已提交至独立分支，并创建：

**PR #545：历史文献轻量化全文检索第一阶段**

本次已经完成以下代码提交：
- 官方来源审计：从正式入库的历史 DOI 中，跨期刊选取最多 50 篇，检查 OpenAlex 的结构化全文可用性和许可信息。
- 独立 Tampermonkey 采集器：在获得相应文本处理许可的出版社页面，手动提取正文章节、段落、Scheme/Figure 图注及表格，生成本地 JSON 文件。
- 本地检索评估器：核对 DOI、正文哈希，统计文本体积，并比较标题检索与正文检索的化学术语命中率。随后已提升比较标准为标题 + Abstract 基线。
- 历史采集规则补充：将历史正文检索试验与原来的 TOC、PDF、正文图片任务严格隔离。

现阶段不会批量下载历史 PDF，也不会自动把受限出版社正文上传到服务器。新版采集器与现有 TOC/VPN Bridge 独立运行，不会抢占正常抓取队列。

专项验收已取得实际结果：历史文本试验 CI #38205100584（之前一轮；经过源码调整后的专项最新 #38205294778）通过。
目前确认：
- 新增的 6 项功能测试全部通过，包括 DOI 身份、授权状态、本地导出、文本哈希与检索召回测试。
- 从当前正式目录中成功选出 50 篇历史文献样本，覆盖 14 本期刊，用于后续来源验证。
- 测试中旧 PDF 请求、文章正文网络抓取、生产数据库写入均为 0。
- 原有历史 TOC-only、metadata-only 和 PDF 禁止自动抓取的回归测试通过。

这些证明第一阶段代码的基本安全门禁已生效，但还不等于 50 篇真实全文已经取得。

## 下一条用户可见终结答复（等待完整门禁状态）

目前 PR #545 的独立试验与历史安全门禁通过；其余站点质量检查尚未全部完成，因此没有提前合并或部署。安装链接不能称为线上可用。真实来源 metadata 50篇和权利审核亦未完成。详细试验规则位于 docs/historical-text-search-pilot.md。
