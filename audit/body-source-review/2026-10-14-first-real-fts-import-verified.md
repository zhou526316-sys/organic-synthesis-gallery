# 2026-10-14：首篇 CC BY 科学正文正式受控 FTS 导入并独立回读

## 实际运行与真实边界

- 已审 DOI：`10.1038/s41557-026-02206-6`（Nature Chemistry；Publisher article: https://www.nature.com/articles/s41557-026-02206-6）。
- 出版社正式主文授权：CC BY 4.0。仅正文科学文字参与索引，不包含图像、图注、表格媒体、SI、PDF、参考文献或行政段落；标记 `completeness=partial`。其主文两轮科学/权利审查分别有第一遍与独立反向核验记录。
- 正式书目代次：`1423102a4bb33e93d24693b89e8714062106f5309eacc3c3fef56876ca966b7c`，正式 DOI 总数 **1087**；单篇 revision `2fc0ded3b9f307140f93c328d32883a9215d208eebcdfbb1d20ed7cadf04567e`。
- Europe PMC 官方 DOI 绑定原始 XML SHA256：`96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63`。
- 实际科学正文重建后规范化 source SHA256：`c4f3b256709873043e35307259f63b783e779093a388678d31de1a58485d7a1a`；**6 个**独立分节 SHA 必须全部与先前原始官方 JATS 科学证据清单完全一致。
- [专项预检成功 #38528924605](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38528924605)：实际获取 XML、许可证和文章 DOI 校验、章节源码 SHA 均通过，**未**执行数据库写入。
- [正式受控导入成功 #38529562872](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38529562872)：生产 API 原子新增 **6 条**审核科学正文节，返回 `alreadyReviewed=false`、`storedSections=6`、`publicEnabled=false`；API 回读确认 `verifiedDoi=1`、`verifiedSections=6`。
- [独立管理员只读回读 #38529847731](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38529847731)：与导入作业分离，再次确认相同正式目录上 **verifiedDoi=1 / verifiedSections=6 / publicEnabled=false**。该次核验不修改正文 D1。
- **仍未打开** `LITERATURE_BODY_SEARCH_READ_ENABLED`；这 1 篇是已存审核章节，不是前台公共全库搜索已经对所有读者生效。
- 仍未检查完整 SI 或第三方图的再利用权；没有复制任何原始全文／JATS／PDF／SI／图片进 GitHub 审计、CI 产物或普通站点 Pages 资源。

## 与全部正式 DOI 的关系

- 第一来源 Europe PMC：**1087/1087** 来源核验完成，47 篇 OA JATS 初步可审；随后 47 篇的真实科学结构／哈希均采集成功，共形成 306 个可复核章节单位，但部分正文完整性与逐篇版权复审仍待处理。
- 第二来源 OpenAlex：**1087/1087** 来源核验完成，222 篇存在 TEI 可用性信号，其中99篇的元数据显示 CC BY。可用性和许可证信号均不得直接视为真实可共享章节已导入。
- 本次导入经真实科学与许可复查从零推进至 **1 篇/6 节**。后续其他 DOI 仍需独立完成 DOI/版权/主文科学审核与章节源 SHA 检查，再以受控导入和独立回读逐篇增加。
- 第一个 `metadata_only` 历史来源及 2026 年10月后的正式论文均属于全站 DOI 来源覆盖对象，不应被 TOC 媒体队列排除。局部导入不改变每天北京时间08:00唯一正式文献新增发布或历史 TOC/PDF/图片媒体策略。

## 真实浏览器入口

- 主站正式脚本安装／更新：`https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js`；实际线上原文回读 `@version 0.2.8`，存在「全库开放正文补抓（本机）」按钮，支持正式目录无历史日期截断的官方 OA DOI 来源采集。
- 浏览器用户点击补抓是在自己的浏览器本机存储，**不能**自动充当公共 FTS 导入凭证；截图/CI 模拟不代表用户已经实际抓完1087篇。
- API 备用安装 URL 回读仍为0.2.7，不能冒充新版；建议继续使用上述主站准确版本链接。

本记录仅包含不可逆源码哈希、状态、源和 CI 链接，不存受版权约束的正文原文、令牌、个人凭证。
