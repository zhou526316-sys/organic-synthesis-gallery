# 2026-10-10 16:48 BJT · 接续公众号「阅读原文」精准 DOI 定位与卡片光效

## 用户批准的修复与已完成事实
- 用户已批准当期两篇精选「阅读原文」精准 DOI 定位、兼容只有日期参数的旧链接、恢复卡片光效、同步原有双篇草稿但不群发。
- Gallery PR #469 `https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/469` merged to main as `7efbbafb748...`. Actual Pages deploy #38037066049, Worker deploy #38037071429, frontend sync #38037066094 and card sharing CI #38037066027 all `success`.
- `src/main.ts` accepts historical `featured` or `featuredDoi` and absent `dois`; edition-only links resolve selected DOI; explicit `?edition&doi` puts DOI first; mobile 12 per page and async render focus.
- `src/card-share.ts` edition fallback via `galleryEditionFeaturedDoi`, 20-second blue halo, re-focus upon early async card replacement, summary popup only if `summary=1`.
- New correct featured link: `https://gallery.gczhouwld.com/?edition=2026-10-10&doi=10.1002%2Fanie.3306470&summary=0`.
- New correct retrospective link: `https://gallery.gczhouwld.com/?doi=10.1038%2Fs44160-026-01128-y&summary=0`.
- Existing published daily QR and old `?edition=2026-10-10` links remain usable (Gallery compatibility, without editing old WeChat posts).

## WeChat same-draft update actual failure (do NOT misreport success)
- Earlier trigger `1ea4e0da42f` of Oct10 draft-update returned `draft/get` **40007 invalid media_id**. The prior same-media success receipt `audit/wechat-publisher/latest.json` from 03:29Z is historical and does **not** prove link update.
- With explicit user approval, PR #470 `https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/470` merged as `41fd11a53fbe...` and added strict `linkOnly=true` safe recovery. Unit tests passed. Recovery lists only the account's current drafts, verifies unique exact ordered titles plus both DOIs, copies full existing article bytes/cover/digest unchanged, updates only `content_source_url`; never draft/add or freepublish. If media ID invalid and no unique draft, fail closed.
- New exact-DOI link-only trigger commit `678257b62c49...` set `audit/automation-triggers/wechat-publisher-request.json` with `linkOnly:true`, `draftOnly:true`, `publicSendAuthorized:false`.
- Actual GitHub workflow `https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/38038714953` completed with **failure** 2026-10-10 08:47Z. Fixed-IP relay stderr: `draft/get failed: errcode=40007 invalid media_id`; read-only `draft/batchget` subsequently yielded `old media_id invalid; no unique matching WeChat draft found; no draft created`.
- **No new WeChat preview URL**, no `draft/update` completed, no new draft, no public send, no changes to existing content. Do not claim it succeeded; draft may have been published/removed but 40007 alone cannot establish why. To edit a published message's source URL directly, publisher privileges/status would need separate authorized confirmation.

## User-facing response (verbatim substance)
网站端已完成，日期旧链接兼容以及 DOI 定位/20 秒光效已随 Pages/Worker 部署上线。微信原草稿未能更新：旧 `media_id` 返回 40007，安全检索当前草稿列表未找到唯一匹配的双篇草稿；因此没有新建或覆盖任何草稿，也没有群发。用户可直接用上述两个 DOI 定位链接验收；旧公众号日期链接仍可依赖网站兼容逻辑定位当期精选。如必须改已发公众号文章本身的链接，需先核实原文是否已经群发、是否仍可在公众号后台编辑，不能用草稿 API 强行新建替代。
