北京时间 19:18 的“发布前审核链路”自动验收已执行，但本次结果是 **fail-closed 的 incomplete_review**，没有伪装成成功。

机器发现层仍然正常：读取到的 fresh audit 生成于 19:09:37，`sourceRecords=554`、`galleryDois=512`、`missingFromGallery=7`、`unresolved=7`，五类 discovery/regression 异常均为 0。

这次测试暴露了下一层真实问题：当前 GitHub 连接器读取很大的单行 `audit/latest.json` 时会截断，能够确认聚合计数和部分候选，但无法可靠取得完整 7 条 unresolved 候选数组。因此不能诚实地声称已经对全部 7 条完成逐篇双遍审核。我没有把看不到的候选猜出来，也没有伪造 `accepted/rejected=0`。

已按固定发布时间规则 fail closed：生产文献数据完全没有修改，生产卡片仍为 512，也没有运行 OA PDF/HTML 提图。staging 证据已写入 `audit/prepublish-review-2026-09-23-0800-test.json`，commit `f458073dce7388eb0d75e479c06eb77b265fba1b`；自动测试记录写入 `audit/automation-tests/2026-09-22-1918-prepublish-review-chain.json`，commit `fac4ceb7db7ab393a631889090f3a2ff6f6d8720`。

本次测试因此非常有价值：**Scheduled Task → GitHub Node audit 已经通过；现在需要修的是 Node audit → ChatGPT semantic review 的候选交接。** 最稳妥的修法是让 GitHub audit workflow 除了 `audit/latest.json` 外，再生成一个很小的 `audit/unresolved-latest.json`，只包含 `generatedAt + summary + active-journal source health + 完整 unresolved/potentialGaps`。07:05/17:05 和 07:35/17:35 以后直接读取这个紧凑文件，就不会因为大 audit 被连接器截断而漏掉候选。

当前结论：自动链路已经通过第一层，第二层准确暴露出一个可修复的接口问题；08:00/18:00 固定发布规则在测试中按预期保护了生产站，没有发生非固定时点的文献上线。