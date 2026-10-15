# Project response synchronization — historical text 0.2.10 production release

- Beijing time: 2026-10-15 23:59:21 (+08:00)
- Task: Continue approved TOC-based historical text refactor, confirm production deployment and two public installer URLs, read fresh real browser metadata.
- PR #698: merged `c954efe82c4641e77a17797291e4edefd56d6b7e`.
- Pages #38760618589: literature_authorization, build, deploy all success.
- Read-only audit: `22377a71db62a38ff9a5f10720f36837c2c0bc32`.
- No Worker redeployment, no publisher fulltext upload, no changes to public FTS, media or 08:00 literature publication.

## Complete visible response (partial and terminal text)

## 历史正文 0.2.10：Pages 部署成功

已核实 [GitHub Pages 部署 #38760618589](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38760618589) 的三项结果：

| 阶段 | 结果 |
|---|---|
| 文献发布授权检查 | 成功 |
| 站点构建 | 成功 |
| Pages 正式部署 | 成功 |

[PR #698](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/698) 已合并，提交为 [`c954efe`](https://github.com/zhou526316-sys/organic-synthesis-gallery/commit/c954efe82c4641e77a17797291e4edefd56d6b7e)。重新读取 `main` 的原始脚本，版本确实为 `0.2.10`，并包含完整 DOI 清单加载、出版社路由和正文解析改造。

正式安装入口的回读发现一项尚未同步的问题：

- **Gallery 主域名**已返回包含新版正文解析器和出版社路由的脚本内容。
- **API 备用域名**仍返回 `@version 0.2.9`，尚未与主域名同步。

因此，暂时只建议使用 Gallery 主安装入口，不能把两个地址都标记为已完成 0.2.10 更新。我会继续追查备用域名的脚本分发链路。

## 正式安装链接

**[安装／更新历史正文 Tampermonkey 0.2.10](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)**

请在实际抓取使用的 Edge 或 Chrome 中打开这个主地址，确认 Tampermonkey 内显示 `0.2.10`，然后刷新 Gallery。暂时不要用 API 备用地址安装旧版。

我也重新执行了[管理员只读诊断 #38665655983](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38665655983)：

| 最新200条诊断事件 | 结果 |
|---|---:|
| 独立抓取尝试 | 146次 |
| 0.2.8 事件 | 120条 |
| 0.2.9 事件 | 80条 |
| 0.2.10 事件 | **0条** |
| 样本中的正文保存成功 | 2次（均来自旧版） |

所以目前可以确认**新版代码已上线，但还没有 0.2.10 的真实浏览器抓取回执**。不能把部署成功说成1,151篇正文已经抓取完成。

## 本轮最终验收与下一步

当前唯一推荐的正式安装地址是：

**[Gallery 历史正文 0.2.10 主安装入口](https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js)**

在 Edge/Chrome 更新后，只保留一个启用的历史正文脚本，刷新 Gallery。先点「全库正文覆盖」确认能读出完整正式 DOI 集合，而不再出现旧版分页读取导致的 0/0。如果正常，再用「全库开放正文补抓（本机）」针对全部正式 DOI 检查 OA 科学正文；「一键补抓全部缺项」继续处理有已核验发表日期的10月前出版社论文。两者不等于公共全文检索已入库，不得把版权未确认的文献原文推送给所有用户。

管理员诊断密钥在**同一浏览器、同一 Tampermonkey 历史正文脚本**内已保存时，无需重新输入；新版实际运行后，点击「立即上传待发诊断」即可供下一次只读审核。0.2.10 的真实成功率和本机已存文章数量仍须以浏览器回执和本机覆盖统计确定。

API 备用域名暂时为旧版0.2.9；因其由独立 Worker 静态资源部署管理，本轮没有冒险重部署整个生产 Worker。不会把该地址标注成0.2.10。

[本轮部署与真实诊断验收报告](https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/main/audit/historical-body-review/2026-10-15-v0210-toc-refactor-live-release-and-owner-diagnostics.md)

**交付状态：0.2.10 主安装器已部署；全部正式 DOI 仍未被证实完成正文抓取；真实用户浏览器验收待完成。** TOC、正文图、PDF、SI 以及每天北京时间08:00唯一正式文献发布均未改变。
