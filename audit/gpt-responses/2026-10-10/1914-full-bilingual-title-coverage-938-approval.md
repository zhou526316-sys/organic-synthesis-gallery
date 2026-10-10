# 2026-10-10 19:15:12 Beijing — 938 DOI 全库中英文标题修复（用户批准）

## 用户需求
用户已明确批准：补全尚缺中文标题的 278 篇，修复检索／分页加载后的翻译缺失，并加强全库双语完整性门禁。

## 本轮实施结果
- 依据 `audit/title-backfill/2026-10-10-full-bilingual-coverage-diagnosis.json` 的 278 个 DOI/英文原题，在 `audit/title-backfill/2026-10-10-editorial-zh-part01.json` 至 `part06.json` 保存 278 条化学专业中文译题，逐 DOI 英文题名配对核验。来源标签为化学编辑翻译，不冒充出版社正式译名。
- 创建 `scripts/apply-full-bilingual-title-coverage.mjs`：只修改 Pages 构建时的 `literature-supplement.json` 与 `title-translations-zh.json` 等派生展示数据，继承先前 125 篇英文＋中文修复及内置已核译标题。全库批准 DOI 的 `titleZh` 完整性检查为硬门禁。
- 更新 `src/main.ts`：为历史检索、D1 索引分页及其他异步新显示文献触发去抖、去重和有界批次的中文标题回填，不把翻译 API 失败视为成功。
- 修复前一版固定为 938 DOI 的两个历史回填包装器计数检查，使未来正常 08:00 批次 DOI 集合增加时不会因历史审计收据而失败。
- 受保护的 7 份正式文献数据、`shared/literature-policy.js`、DOI 集合、英文原题、作者、发表日期、TOC、正文图和私有 PDF 均未修改。
- 独立 CI `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38047515480` 成功：938/938 本地英文与中文标题、278 本轮译名全部生效、先前 125 译名保留、7 项负面测试、扩展至 939 DOI 的后续正式批次兼容性测试、TypeScript 编译与正式发布授权保护全部通过。
- PR [#494](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/494) 已合并到 `main`，修复提交 `2b0162efdbe7e98963fb9603401561975a5cfebb`。

## 线上状态及诚实表述
GitHub Pages run `38047597373`（#494 SHA）因为其他新提交的并发发布排队被取消，当前更新链已被后续候选部署 `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38047603059` 取代。该候选构建仍 `pending`，前一构建 `38046935614` 仍在运行。已核实最新 `main` 保留本次完整补译模块及分页翻译刷新代码，但**不能把代码和离线 CI 成功表述为正式网站已上线／已通过真实浏览器验收**。

## 实际回复正文
本次获批的 278 篇缺失中文标题已补齐并加入构建流程。回归测试确认全库 938 篇文献都具有可持久化的中英文标题，0 篇缺失；历史搜索、分页新加载文献的中文翻译刷新也已修复。PR #494 已合并至 main；测试 #38047515480 通过；没有修改正式文献、发布日期和 TOC/PDF。

线上 Pages 部署目前仍因其他构建占用而排队，新的部署任务是 #38047603059；因此当前网站可能还展示旧英文标题，尚不能声称生产部署成功。可通过部署链接查看当前状态；成功后在 https://gallery.gczhouwld.com/ 强制刷新，进行中文／EN 切换。 
