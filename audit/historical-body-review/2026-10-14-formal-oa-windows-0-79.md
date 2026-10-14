# 2026-10-14 — 正式历史 DOI 开放科学正文来源核查，offset 0–79

- 正式唯一生产基线：`main`，当前 Pages `catalogId = f263e943427a16c8fa52c828d786fb90fc7366d6e01bd74e1b2b1bd148d69870`。
- 正式 DOI：1087 篇；2026-10-01 前首发日期已核验：826 篇；历史日期待核实：10 篇。文献目录随已核准出库变化，不将旧 1091 篇目录的报告跨代次拼接。
- 只读获取 Europe PMC DOI 精确匹配元数据与 OA JATS 的文章级许可证及结构计数；**原始全文/XML 未存 Git、D1/R2，也无出版社浏览器/PDF/正文图访问**。文献未审核通过、无共享索引导入。
- 本轮涵盖官方目录的4个连续、无重叠的20篇窗口：offset 0、20、40、60；下一窗口从 **offset 80** 恢复，必须再次检查该 `catalogId`。
- GitHub Actions 实际运行：
  - [0–19：#38499910931](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38499910931)（artifact 11865152918）
  - [20–39：#38500108635](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38500108635)（artifact 11865168186）
  - [40–59：#38500247352](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38500247352)（artifact 11865168499）
  - [60–79：#38500454607](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38500454607)（artifact 11865900832）
- [PR #633](https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/633) 新增的源扫描仅限受限参数、同目录代次、每次至多20篇，GitHub提交触发不会自动把 OA 候选发布。

## 80篇的真实来源分类

| 类别 | DOI 数 | 严格解释 |
| --- | ---: | --- |
| `needs_independent_review` | **8** | JATS 精确匹配 DOI + 明确 CC BY 3.0/4.0 + 科学正文结构，仍需真实独立版权与科学审核 |
| `reuse_restricted` | 18 | 官方来源有对再利用构成限制的许可／声明，不能推断为可公开原文 |
| `pmc_oa_missing` | 30 | Europe PMC 元数据不符合当前开放全文条件，不代表出版社不存在正文 |
| `metadata_doi_missing` | 23 | 此次 Europe PMC 未确认唯一匹配 DOI，不能从此推断论文不真实 |
| `license_unknown` | 1 | 尚未有足够文章级开放许可证明 |
| **合计** | **80** | **公共正文自动导入 = 0；新的全文检索覆盖不因此增加** |

## 独立人工审阅候选（非审核通过、非正式全文完整）

| DOI | 期刊 | 许可候选 | JATS 结构 | 来源 XML SHA256 |
| --- | --- | --- | --- | --- |
| `10.1038/s41557-026-02206-6` | Nature Chemistry | CC BY 4.0 | 9 sec / 3 fig / 3 table；complete_candidate | `96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63` |
| `10.1038/s41929-026-01566-z` | Nature Catalysis | CC BY 4.0 | 23 sec / 6 fig；complete_candidate | `85f0750cb978d86e914c44eb78cda920f83c4d880acd0304165283c3bbd5569d` |
| `10.1002/anie.9599258` | Angew | CC BY 4.0 | 5 sec / 5 fig；complete_candidate | `7f404754308efcfe5ef0b87cd459651002257704957ef0256d291c8764982341` |
| `10.1039/d6sc05170g` | Chemical Science | CC BY 3.0 | 14 sec / 6 fig / 1 table；complete_candidate | `50c567edba7a3bb65a6267af17ff5cd6678a8cd1b58c568e2e73e26615983557` |
| `10.1002/anie.8336123` | Angew | CC BY 4.0 | 18 sec / 7 fig / 2 table；complete_candidate | `48abaa714b9516882fb2b2f3def93ed263ca81966bee6966df3e4e3523cc51b4` |
| `10.1126/sciadv.aeg4594` | Science Advances | CC BY 4.0 | 25 sec / 8 fig；**partial** | `5fbe546e96e4bca53d7e0a19660239f8be0216ce2400b5b4da9e78ced4c3a95e` |
| `10.1039/d6sc04627d` | Chemical Science | CC BY 3.0 | 14 sec / 5 fig / 1 table；complete_candidate | `07a68c7c6b7b53a74d13046ff89dbfa131bfe56774da423f8e8975456df64313` |
| `10.1038/s41557-026-02214-6` | Nature Chemistry | CC BY 4.0 | 24 sec / 5 fig；complete_candidate | `d301c54680ebb62fd41a3d738493694b9c6133619f686d8d06eb5b04d3d00146` |

**下一道实质性质量门禁：**逐篇核实该文章真正 CC 许可、整篇科学章节与 Figure/Scheme/Table 图注（禁止把 JATS 中的 `complete_candidate` 当作完成证据）；检查 DOI 和现行目录 revision、单节和全文哈希、图注是否引用他人第三方图片。只有独立审核通过者，才可以调用原有 `literature-body-search.js` 的严格导入接口；此文档不是导入授权。版权受限的正文继续仅限合法私人检索，不公开原文。

**浏览器回执独立故障：** PR #624 0.2.7 已上线并提供“出版社回执核验（最多8篇）”；目前无该版本用户本人 Edge/Chrome 实测结果，不能把 CI 浏览器模拟当成恢复成功。保留旧 527/527、67 本机包和失败快照，不盲目重跑所有 DOI。
