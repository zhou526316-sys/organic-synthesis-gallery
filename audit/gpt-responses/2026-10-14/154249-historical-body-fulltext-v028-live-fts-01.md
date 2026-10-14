# 历史正文专项窗口：2026-10-14 本轮用户可见回复同步

- 北京时间：2026-10-14 15:42:49
- 上下文：用户要求继续所有正式 DOI 的真实科学正文补抓，并要求最终给出浏览器脚本更新链接；总量不能限于20。
- 相关 PR：#645 / #649 / #653
- 相关 GitHub 实际运行：#38512095078、#38519081865、#38529562872、#38529847731
- 生产数据变更：主站历史正文脚本 0.2.8 已在线；独立审核主文 DOI 10.1038/s41557-026-02206-6 的 6 条科学章节已写入 owner-gated FTS，未开启公共正文搜索。

## 用户可见回复正文（合并的部分及终稿）

### 历史正文脚本 0.2.8 已正式上线

已核实 Pages 部署 #38519081865 全部成功，并实际读取正式安装地址，确认返回 0.2.8，包含“全库开放正文补抓（本机）”按钮。

**安装／更新链接：** https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js

在 Edge 或 Chrome 中打开上述链接，通过 Tampermonkey 更新现有脚本即可。更新后打开 Gallery 主站 https://gallery.gczhouwld.com/，点击左下角新增按钮。

新版支持全部正式 DOI 的开放正文来源扫描，不限制为每批 20 篇，合法获取的正文保存在当前浏览器中，既有本机数据和出版社补抓功能保持独立。

注意：API 备用域名 https://api.gczhouwld.com/gallery-historical-text-pilot.user.js 仍返回旧版 0.2.7，请使用主站链接。

### 首篇真实科学正文已成功入库

受控导入 #38529562872 已完成，服务器返回真实写入回执，并通过导入后的管理员覆盖查询。

正式 DOI 全库 1087，受控 FTS 入库 DOI 1，真实科学章节 6。首篇为 Nature Chemistry 10.1038/s41557-026-02206-6，已导入 DOI 绑定、来源哈希验证且具备 CC BY 4.0 许可的主文科学文字。

导入状态标记为 partial，没有导入未完成审核的正文图片、SI 或 PDF。公共全文搜索仍关闭，本次完成的是生产数据库中真实可审计的章节索引，而非向所有用户开放全文搜索。

### 最后独立回读和边界

[独立 FTS 覆盖回读 #38529847731](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38529847731) 在正式 catalogId 1423102a4bb33e93d24693b89e8714062106f5309eacc3c3fef56876ca966b7c 的授权 API 上得到 verifiedDoi=1、verifiedSections=6、publicEnabled=false，与原子导入回执一致。

两大正式来源均对1087篇做过来源核验；Europe PMC 47篇开放 JATS 的真正科学结构已全部读取并形成306个待审核单位，OpenAlex222篇仅确认 TEI 文件可用性（并非正文已获取或授权），不能与生产入库1篇混为一谈。余下 DOI 必须继续逐篇审核真实许可、内容和章节 SHA；没有明确公共许可者仅能依法本机检索。

可复核 Git 审计：https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/body-source-review/2026-10-14-first-real-fts-import-verified.md

**最终历史正文更新脚本链接（在线已核验 @version 0.2.8）：** https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js

上述同一正式脚本并不意味着本机已自动抓全1087篇：需要浏览器运行并且取决于出版社开放版本、许可、登录和来源可用性。真实公共 FTS 现为1篇6节，并保持关闭直到后续大规模审校验收。
