# UI / feedback 28A — tested implementation checkpoint

Beijing time: 2026-09-22 23:21:00 +08:00
Context: 接续吐槽与界面优化；用户“继续”。
Repository: zhou526316-sys/organic-synthesis-gallery
Previous progress log: audit/gpt-responses/2026-09-22/230910-ui-feedback28-progress.md
Implementation branch: feat/ui-status-original-images-20260922
Tested integration commit: 610ddd1f79f8dd49c9af34c89df7a9c62d4c8b12
PR: 131, open, not merged, no deployment performed by this turn.

## Evidence

Actions workbench run 35745769233, job 106806880402 completed successfully. Original image tests: 6 passed (48.4 seconds). Existing interaction suite: 13 passed (3.2 minutes). TypeScript and Vite build passed. All four temporary patch scripts, temporary workbench workflow and staging bundle removed from the branch before PR creation. Final diff against baseline e1c3e39d9543d514107f515926acd548570c8903 has 13 files: UI modules, tests, permanent read-only CI and documentation only.

Artifact 10703195223 (ui-original-image-verification), SHA256 f209cd939e43fe35d7c01dc31e71bb021e2c8a2397f589577fa827361cb66761 downloaded and digest verified. Read actual original-tests.log, legacy-tests.log and verified-commit.txt. Actual mobile screenshot inspected. Earlier mobile/desktop viewer screenshots were also inspected from prior 5/6 run with the same implementation; final acceptance counts are from the successful run, not those earlier screenshots alone.

Checked: source byte hashes; actual two-frame GIF animation; unchanged dimensions; refresh on 390px and 1280px viewports; bounded viewer; original-unavailable static preview in another context; exact 30,000,000-byte source and +1-byte rejection; invalid signature/corrupt image; explicit database and preference-storage failure; removal while upload is in flight. Fault-injection assertions verify the failure stub was actually called.

Retained failed runs: 35743954050 and 35744676540 exposed IndexedDB Blob/File write failure. 35745260747 passed 5/6; the instance-only IndexedDB failure mock did not intercept the implementation. Updated to IDBFactory.prototype.open and counted actual stub calls; all preservation assertions retained.

PR-triggered checks at handoff: 35746609786 (new image regression), 35746609397 (authors/site data), 35746609564 (migration CI), 35746609547 (normal site quality gate). Queued/ongoing, not yet claimed passed. PR not merged or auto-merged. Do not mark feedback28 closed before deployment acceptance.

Scope boundary: originals/GIF remain private to the same browser and origin in IndexedDB; account preferences carry a static PNG preview and file metadata only. This is not original/GIF cloud backup. Browser-data deletion/eviction can remove originals. Removal unlinks preference; unreferenced original-byte garbage collection is not implemented in this first batch. Existing optional static crop uses the old 20 MB limit.

No production literature data, publication gates/schedules, media acquisition/Bridge source or server repair gates changed. No production reader-count events, account records or feedback submissions were written by tests. Reading-count production investigation and Pages-entry release acceptance remain outside this batch.

## Further user-visible progress messages

原图字节存储已通过测试：30MB 边界、GIF 动画、手机与桌面刷新恢复都正常。剩下一项失败是测试没有成功模拟数据库故障，我会修正故障注入并保留原验收要求。

新增的 6 项原图测试已全部通过，包括 GIF 帧变化、原文件哈希、30MB 边界、刷新恢复和保存失败保护。正在完成原有界面回归；第 28 条仍保持未关闭，尚未上线。

这一批测试已全部通过：新增 6 项原图测试、原有 13 项界面回归，共 19 项。临时调试文件已移除，正在提交正式 PR；线上版本和吐槽关闭状态暂不改变。

## Final user-visible reply

**第 28 条“状态图片、原图和 GIF”已完成首批实现与测试，正式 PR #131 已提交；目前尚未合并上线。** 本批实现提交为 `610ddd1`。fileciteturn101file0L2-L13

### 这批实现了什么

**上传后直接显示图片。** 阅读状态不再只附带一个小图标，而是直接显示上传的图片，并按原比例适配；提供“查看图片”入口，在非全屏窗口中查看。默认不强制裁切，需要裁切时才勾选“静态裁切”。fileciteturn101file0L8-L8

**支持 GIF，原图上限为 30MB。** 支持 PNG、JPG、WebP 和 GIF，默认保留原文件字节及动画；原有静态裁切功能仍保留，其上限仍为 20MB。fileciteturn101file0L8-L8

**上传失败不会覆盖旧图。** 文件过大、格式损坏或存储失败时会明确提示并保留原设置；上传过程中移除图片，也不会被稍后完成的旧任务重新恢复。fileciteturn101file0L8-L8

### 已完成的验证

类型检查、生产构建和 **19 项浏览器测试全部通过**：新增 6 项原图测试，加上原有 13 项界面回归。新增测试实际检查了 GIF 帧变化、原文件哈希、30MB 边界、390px／1280px 下的刷新恢复，以及保存失败保护，不是只检查“出现了图片”。fileciteturn101file0L8-L8

**当前限制需要明确：原图和 GIF 动画只保存在同一浏览器、同一网站入口中；账号跨设备同步的是静态预览图。** 清除浏览器网站数据可能丢失本地原图，因此这一批还不是原图云备份。fileciteturn101file0L8-L8

PR 的正式质量检查已触发，但尚未完成合并及线上验收，所以现在刷新网站还不会看到这批新功能，第 28 条也没有关闭。本批未改抓图链路、文献数据或真实阅读人数。fileciteturn101file0L4-L8

[查看第 28 条测试记录与截图](sandbox:/mnt/data/feedback28-original-images-verification.zip)
