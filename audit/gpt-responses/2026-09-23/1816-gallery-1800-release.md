Beijing time: 2026-09-23 18:16 +08:00
Context: Gallery 08/18正式发布 — 2026-09-23 18:00 slot

18:00 这一槽没有达到“完整闭环成功”，我已按 fail-closed 记录为 `sync_failed`，没有把质量门失败伪报为成功。槽前冻结快照本身通过了严格预发布门禁：`audit/prepublish-review-2026-09-23-1800.json` 覆盖 44 个候选，10 include、32 exclude、2 pending；prepublish gate run `35843296908` 的 `--allow-deferred --require-ready` 两项检查和 strict release bundle 均成功。

固定槽生产写入随后成功完成。第一次 release writer run `35846403778` 在提交前因可选兼容文件 `public/literature-supplement.json` 不存在而失败，因此没有产生生产提交；我只修正了该工作流的可选文件处理，随后 run `35846486478` 成功。原子生产 release commit 为 `020c2bef85415aaeb42c57ce30415e3c4112d97a`，正式发布 10 个已审核 DOI，保留 2 个 deferred，生产 DOI 数由 532 变为 542。TOC demand refresh run `35846567355` 成功，队列 commit 为 `789c95ac53fccf95d6eac171ac751f25a6b30098`。Pages run `35846639220` 的 literature_authorization、build、deploy 全部成功，实际完成于北京时间约 18:07:12；仓库和线上 DOI 数均为 542。

但后验完整性审计暴露了本轮不能标记为成功的关键问题。post-release audit run `35846667938` 成功生成 `2026-09-23T10:07:15.330Z` 快照：`galleryDois=542`、`sourceRecords=541`、`unresolved=13`，且 `criticalSourceFailures/sourceFamilyGaps/sourceCoverageAnomalies/historicalCoverageLosses` 均为 0，`closureCoverageAnomalies=1`。其中只有 2 个 DOI 是冻结正式 review 中已经登记的 deferred；另外 11 个 DOI 是在 17:13 冻结 handoff 之后、18:07 后验审计之前进入机器候选集合的新增量，未经过本槽双遍语义审核。因此它们不能被静默当作 pending、exclude，也不能在 18:00 之后补发。

我随后显式运行真实 literature-quality-gate，run `35847270118` 按预期失败。它确认 `repositoryDois=542`、`deployedDois=542`，所以不是 Pages 或生产 DOI 集不一致；失败项是 `discovery: unreviewed unresolved DOI not covered by deferred backlog`，以及当前发布不能被记录成 `synced_with_pending`。这 11 个未审核增量已经作为 carry-forward 保存，包含 `10.1038/s41557-026-02247-x`（Nature Chemistry，N-alkyl aziridine divergent ring opening/functionalization）和 `10.1021/acs.orglett.6c03520`（Organic Letters，Au(I)-catalyzed C≡C cleavage to 2-aminobenzonitriles）等，均留给下一固定槽重新按范围规则完整审核；没有任何一篇被本轮临时新增到生产。

协调状态已经真实写成 `phase=sync_failed`，`publicationChecksPassed=false`，而不是继续保留误导性的 ready/synced 状态；失败状态 commit 为 `87531bb047d16343cb6767c13f6d6443b8b6fbdc`，记录器 run `35847630800` 成功。当前生产站仍是本槽已部署的 542 张卡片，其中新增的 10 篇来自冻结且已通过严格审核的 allowlist，但本槽整体不宣称质量闭环成功。11 个新出现的未审 DOI 加上原有 2 个 deferred 将在下一固定槽处理；下一槽为北京时间 2026-09-24 08:00。`verifiedThrough` 不前移，媒体仍只交 Tampermonkey/VPN Bridge，未启用 OA PDF/HTML 提图。

这次暴露的是一个实际流程缺口：17:13 的 fresh handoff 到 18:00 原子提交之间仍可能出现新的索引增量，而现有发布写入只锁定了旧 handoff。后验门禁正确把它拦成失败，没有掩盖。后续应把“槽前最后增量检查/恢复审计”绑定到 release writer 的输入授权，确保提交前若 candidate set 增长则重新审阅或直接错过该槽，而不是等部署后才发现。
