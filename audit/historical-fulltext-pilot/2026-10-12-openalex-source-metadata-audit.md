# Gallery 历史全文检索 — 首轮 OpenAlex 官方元数据来源核验

- 核验时间：2026-10-12 13:00–13:02 北京时间；原始审计 `checkedAt=2026-10-12T05:00:51.176Z`
- 仓库：`zhou526316-sys/organic-synthesis-gallery`，`main` 唯一基线
- 合并工作：[PR #545](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/545)，提交 `cea8b113e18fad29af4bccaebf631f2e3ebce693`
- 真实 GitHub Actions：[run #38206086450](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086450)，`success`
- 完整机器审计工件：[gallery-historical-text-openalex-38206086450](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38206086450/artifacts/11727601175)，保留14天
- DOI 目录版 `catalogGeneratedAt=2026-10-12T00:00:19.131Z`，`catalogSize=964`；样本 50 篇来自当时正式目录，发表日期早于2026-10-01
- 审计性质：只调用 OpenAlex Works **元数据**，没有请求 PDF、TEI 正文或出版社文章正文；没有写入 D1/R2 或发布公开全文检索

## 真实结果

- DOI 与 OpenAlex 元数据严格匹配：**50/50**；失败/缺少原文记录的 API 分类本轮为0
- `has_content.grobid_xml` 并且 `content_urls.grobid_xml` 可按预期格式识别：**20/50（40%）**；这仅是结构化正文的**入口可用性**，未经下载和文本内容校验
- 20 篇 TEI 候选的 **OpenAlex best OA location 许可元数据**：`cc-by` 10、`cc-by-nc-nd` 5、未提供5；`licensedTei=0` 是**尚未进行特定全文来源及版本的独立许可核验**，并不是“全部无合法复用权”
- 不推断50篇是16刊全历史总体的无偏样本；不把40%当作全站全文覆盖率、实际可读率或可转载率

| 期刊 | 查验 DOI | TEI 元数据可用 |
|---|---:|---:|
| ACS Catalysis | 5 | 0 |
| Angew | 4 | 4 |
| CCS Chemistry | 3 | 0 |
| Chem | 1 | 0 |
| JACS | 4 | 0 |
| JOC | 4 | 1 |
| Nature | 4 | 1 |
| Nature Catalysis | 4 | 3 |
| Nature Chemistry | 4 | 2 |
| Nature Communications | 4 | 4 |
| Nature Synthesis | 4 | 2 |
| Organic Letters | 4 | 1 |
| Science | 4 | 2 |
| Science Advances | 1 | 0 |
| **合计** | **50** | **20** |

## 10篇 CC BY 元数据候选（**不是10篇已审核准入**）

- `10.1038/s41929-026-01560-5` Nature Catalysis，2026-07-01
- `10.1038/s41586-026-11108-z` Nature，2026-09-30
- `10.1038/s41929-026-01616-6` Nature Catalysis，2026-09-29
- `10.1038/s41557-026-02247-x` Nature Chemistry，2026-09-23
- `10.1038/s41467-026-77771-y` Nature Communications，2026-09-28
- `10.1038/s41557-026-02206-6` Nature Chemistry，2026-07-13
- `10.1021/acs.orglett.6c02234` Organic Letters，2026-07-01
- `10.1021/acs.joc.6c01880` JOC，2026-09-30
- `10.1038/s41929-026-01600-0` Nature Catalysis，2026-09-15
- `10.1038/s41467-026-78066-y` Nature Communications，2026-09-25

### 出版社原文许可证独立抽查：严格区分版本

- [Nature Catalysis / `10.1038/s41929-026-01560-5`](https://www.nature.com/articles/s41929-026-01560-5) 在公开出版社页面显示 *preview of subscription content*，但 OpenAlex best OA location 提供 CC BY 标签。这可能是其他开放版本（例如作者稿）的许可，不得套用于出版社付费版本；本 DOI **保持 rights_pending**，优先查明 TEI 底本及许可。
- [Nature Catalysis / `10.1038/s41929-026-01616-6`](https://www.nature.com/articles/s41929-026-01616-6) 出版社页面明确 **CC BY 4.0**，只是许可层初步通过；TEI 是从哪一版本生成、正文 DOI/内容哈希仍待核验。
- [Nature Communications / `10.1038/s41467-026-77771-y`](https://www.nature.com/articles/s41467-026-77771-y) 出版社页面明确 **CC BY 4.0**；仍须留存作者署名、许可证链接、版本、是否改写和第三方材料例外。
- [Organic Letters / `10.1021/acs.orglett.6c02234`](https://research.cuhk.edu.hk/en/publications/divergent-three-component-assembly-of-densely-functionalized-dibe/) 机构研究登记标记 **CC BY**，出版社正文下载版本还需独立验证。

**原则：OpenAlex TEI可用与OpenAlex最佳开放位置许可证不是同一个“已证实”的版本身份。** 不能把 metadata CC BY 自动转化为 Gallery 公开全文索引/全文片段许可。

## 已完成与未完成的界限

- 本轮已验证：50篇正式历史 DOI、20篇 TEI入口、许可元数据分布、3个出版社/机构正文授权信号；真实源码已合并；新版手动本机 Tampermonkey 文本提取器作为**独立**脚本，不影响旧 PDF/媒体规则。
- 未完成：TEI 原文逐篇下载、内容哈希/版面解析、同版本许可完全复核、50–100篇真实本地提取、上传/公共全文搜索索引及手机端展示。所有未解决保持 pending，不能称“网站全文检索已上线”。
- 保留每日北京时间 **08:00唯一正式新增**，不新增历史 PDF、正文图、SI 捕获，不改变此前已存在资产。
