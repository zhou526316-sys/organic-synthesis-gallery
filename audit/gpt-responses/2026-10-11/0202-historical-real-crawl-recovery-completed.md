# Organic Synthesis Gallery — Historical real crawl recovery and acceptance

- Beijing time: 2026-10-11T02:02:14 (Asia/Shanghai)
- Conversation: "接续历史文献回溯" — User approved correcting the 23:00 trigger and restoring the 23:40 independent scheduled review.
- Repo: `zhou526316-sys/organic-synthesis-gallery`. main snapshot: `f6fc7fc8e574095c66d9c5fbc9d597fea6db31f3`; staging: `staging/historical-archive-nightly`.
- Only 08:00 Asia/Shanghai is authorized for formal new-paper admission; NO 18:00 slot.

## Actual actions and verified evidence
1. Re-enabled existing `Gallery 历史回溯验收` task ID `6ac9de345ca081918a8bc5871e111e3c`, with original Asia/Shanghai 23:40 recurring schedule and original audit prompt unchanged. Status returned `is_enabled=true`; not yet observed executing after restoration.
2. No 2026-10-10 23:00 historical Actions run appeared and staging still had 0 attempts, 0 completed units, lastRun=null. GitHub official docs describe potential top-of-hour scheduled-event drops; this is a plausible scheduling failure, not proven as the specific cause.
3. PR #532 merged as `72a4bb3b4434955a947e5519620b0ef8a517ac94`. Kept `0 15 * * *`, added deduped `9 15 * * *` (23:09) fallback plus main-only narrow `audit/automation-triggers/historical-nightly-run-request.json` push kick. Added pure schedule gate with tests: 8/8 passed; Tampermonkey, private-PDF and full site quality gate passed. The collector and 08:00 production writer were not changed.
4. First REAL workflow run [#38073396190](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38073396190) was triggered by push at 2026-10-11 01:50 Beijing, but failed before source fetch at `git merge --no-edit origin/main`: `fatal: empty ident name`. Its staging cursor remained unchanged.
5. PR #533 merged as `99aefee883c86721f8b1d8c7dac0ea55205b12ae` after all four CI categories succeeded. It moved the identical bot Git name/email config above the staging merge in the workflow, without any other source/media/publisher changes.
6. A second one-shot scoped trigger was pushed as main commit `f6fc7fc8e574095c66d9c5fbc9d597fea6db31f3`.
7. Second REAL run [#38073920703](https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38073920703) completed **success** (`event=push`, started 2026-10-11 01:58:49 Beijing and finished shortly after 01:59). It passed the previously failing staging merge, actual Crossref/OpenAlex requests, stage-only commit and all GHA completion checks.

## Staging readback — source window 2026-09-22 through 2026-09-30
- Staging commit: `7bab35b69628965e57d84d3c5f7f04dcccff2835`
- State blob SHA: `f465f3996f5cad7d81bd568f0ea09e7f1797cece`.
- Eight real JSON batch receipts saved with `source_enumeration_complete`, no source errors.
- Cumulative API source requests: 37. processed=8, blocked=false, completeWindows=8.
- Per journal candidate DOI rows / already present:
  - JACS 155 / 34
  - Angew 213 / 41
  - Nature 153 / 2
  - Science 44 / 2
  - Nature Catalysis 4 / 1
  - Nature Synthesis 9 / 2
  - Nature Chemistry 16 / 2
  - Nature Communications 272 / 3
- **866 candidate records = 866 distinct DOI across the eight batches; 87 already in Gallery; 779 still unfinished without scope review.** These counts do not mean 866 synthetic methodology articles or any newly published card.
- `abstract.available=true` metadata for 712/866, `storedText=true` for 0; no copyrighted raw abstracts copied. Legal display/indexing and academic two-pass adjudication remain separate.
- One issue-level DOI-like OpenAlex candidate `10.1002/anie.v65.40` has no title/authors, publication date 2026-09-28, Volume 65 Issue 40. Do NOT mistake it for an eligible paper. Identified and filed to existing Issue #498; no automated delete or formal admission.
- Cursor advanced to `range=2026-09-22..2026-09-30, journalIndex=8` (ACS Catalysis next).
- Eight original batch artifacts under `audit/historical-staging/batches/`. Full readback gave zero malformed DOI patterns, 1 missing English title (the above issue record) and 0 duplicates across batches.
- Real source enumeration across Crossref/OpenAlex was complete within the sources' returned pagination, NOT a guarantee that every historical synthetic method paper has been screened.

## Protected production and workflow verification
- Published release marker remained 938 DOI cards, SHA `56ed469282fd3405e704c73996dbe8a0d0e47b6f`; TOC queue remained 938 and blob SHA `80cded35a419cdb641b9a1239eb33355afdf3108`.
- All eight protected literature input SHA values matched the previous 2026-10-10 08:00 formal release marker; no user PDF, TOC or body figure acquisition from this retrospective metadata collector.
- Current main historical workflow YAML blob `e4a357cf2200b26cd30327ce9d6b9d7d58cf6864`: original 23:00 cron retained, 23:09 backup, narrow one-shot trigger, git identity before merge; helper blob `160e70ada9f3400c09d00436a599468490f6c510`.
- Remaining: first scheduled `schedule` event (rather than push recovery) still needs to be confirmed in an upcoming night. The independent 23:40 semantic-review task was re-enabled, but has not yet produced a post-reenable execution audit. PR #499 auto-bisection remains a distinct unmerged draft, and neither history throughput increase nor all-time search admission is authorized by this fix.
- Issue tracker: https://github.com/zhou526316-sys/organic-synthesis-gallery/issues/498#issuecomment-6100541179
- Earlier interim response sync: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/audit/history-recovery-interim-20261011/audit/gpt-responses/2026-10-11/0154-historical-recovery-interim.md

## User-visible answer, substantially synchronized

**23:40 历史回溯验收任务已重新启用。** GitHub 原 23:00 历史采集在 10 月 10 日晚没有实际运行记录。先合并 PR #532 恢复 23:00/23:09 去重备援与受控单次启动；第一次真实 Actions #38073396190 在 staging git merge 因机器人 Git 身份尚未配置而失败。再合并 PR #533 调整配置顺序，并提交受控重试。

**历史文献回溯现已真正开始并完成首批八个窗口。** GitHub Actions #38073920703 success；Crossref/OpenAlex 共 37 次 API 请求，8 个窗口完整、无来源阻断。2026 年 9 月 22—30 日 JACS 155、Angew 213、Nature 153、Science 44、Nature Catalysis 4、Nature Synthesis 9、Nature Chemistry 16、Nature Communications 272，合计 866 条独立 DOI 候选，87 已在正式库，779 未完成学术双遍审核；712 条具有摘要来源存在标记，但 0 条原始摘要正文被未经许可复制到 staging。下一期刊 ACS Catalysis。正式网站仍 938 篇、受保护文献源 SHA 均未变，没有将历史候选混入每日新增、热门、公众号内容，也没有抓新 PDF/正文图。

每晚原定北京时间 23:00 定时与 23:09 去重兜底已部署，23:40 独立审阅任务已恢复；首次 `schedule` 事件及审阅任务实际执行需按后续审计确认，不能以这次成功的受控 `push` 运行冒充。历史回溯总目标、摘要全文检索、语义审查和提速继续由 Issue #498 跟踪。
