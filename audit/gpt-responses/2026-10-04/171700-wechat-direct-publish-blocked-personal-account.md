Beijing time: 2026-10-04 17:17 +08:00
Context: User approved direct publication. Final WeChat draft is ready, with:
- author: 化之岛
- fixed original notice in the body
- content_source_url: https://gallery.gczhouwld.com/?edition=2026-10-04
- edition landing page verified on production: featured DOI first, then the other four DOI cards in article order
- final preview: https://relay.gczhouwld.com/wechat-preview/a09ea00bbd9bb5a581f3e53b.html

Direct publish attempt:
POST /cgi-bin/freepublish/submit
Result: errcode 48001, errmsg "api unauthorized"

Official WeChat documentation states:
- freepublish/submit is available only to eligible account types.
- Since July 2025, personal-subject accounts, unverified enterprise accounts, and accounts that do not support verification have had the publish APIs withdrawn.
- For public/subscription accounts the API is "仅认证"; service accounts are supported per the current eligibility table.

Therefore:
- Do not keep retrying freepublish/submit for this personal account.
- Draft creation/update/readback remains API-driven and automated.
- Final publication requires the WeChat web UI (or a future eligible verified account).
- If browser automation is used, require a one-time authenticated mp.weixin.qq.com browser profile/QR login and retain it for future UI publication attempts.
