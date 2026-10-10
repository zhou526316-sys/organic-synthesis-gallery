# 2026-10-10 11:31 BJT · User's incomplete Fig.5e and SI Table S11 fixed in same WeChat draft

## User request
User supplied two actual WeChat screenshots proving Nature Synthesis 10.1038/s44160-026-01128-y retrospective `Fig.5e` and `SI Table S11` were cropped and demanded immediate replacement **in the existing real WeChat draft**, not just an explanation.

## Source-based fix
- Checked exact original user uploaded main PDF `s44160-026-01128-y.pdf` and SI `44160_2026_1128_MOESM1_ESM.pdf`.
- Main manuscript p.7, original Fig.5e full panel now contains all Int-I/II/III/IV/V, left alcohol activation via A-3/DMF, `Ni(I)/Ni(II)/Ni(III)` working cycle, right HER electrochemical process and `X=Br or I` label. Exact render (not AI redrawing) 1048×748 px SHA256 `16237e41194bf7f4d9b56d56008d261acee6d19ac155759b88761181327e311b`.
- The authentic `Supplementary Table 11` is **two physical PDF pages 19–20, SI printed pages 18–19**. Previously only upper portion of first page was used. Both full source-page portions now appear consecutively:
  1. `SI Table S11` full title, three header groups, all first-page data: 1427×2128 SHA256 `7fd012103a46ef248bdd6e5485a40fdb05a65344d9fc0e5c81896942ecaca6e9`.
  2. `SI Table S11` complete continuation (all 28–41/67–80/123–134 rows) and final Faraday-charge formula: 1427×1362 SHA256 `9aa1899f8eb227371fd94a7d739d2bc1b93f1e14d38f7041508185c62c6f00dd`.
- All images were programmatically rerendered from exact original user PDF and pixel SHA256-checked. There is no generated/synthetic molecule/table. No title/header/table row/arrow/electrode is clipped.
- New pinned source images live under `public/wechat-assets/reviewed/2026-10-10-r4-complete-evidence/`. Retrospective manifest `public/wechat-retrospective/alcohols-electrochemical-crosscoupling-qiu-20261010-r5.json` uses unchanged `f20`, `s16`, and new `s16b`, table pages adjacent at section9 paragraph2. Figure descriptions explicitly indicate original full evidence.
- Source-only independent review GitHub Actions **#38020652442 PASSED**, `audit/wechat-working/2026-10-10-r4-source-figure-completeness-qa.json` status=`source_review_pass`. Review gate `audit/wechat-working/2026-10-10-review-gate.json` text/image pass, 52 exactly SHA-pinned raster assets; two previously broken files excluded from active assets. Exactly 47 other body scientific figures and two user-approved covers unchanged. Chinese text and two article titles untouched.

## Real WeChat API work done
- Fixed-IP existing Official Account API publisher GH Actions **#38020721510 SUCCESS**.
- `audit/wechat-publisher/latest.json`: stage=`draft_update`, mode=daily, `draft_readback=ok`, paper_count=23, original media_id unchanged `KhELYUzvwADwB_l1xH1SWFOfn60HSWWcYlciDjMIDj7HKSul-GJJti3u0OIKFcyL`, `publish_id=null` (no public send).
- **New real WeChat preview**: https://relay.gczhouwld.com/wechat-preview/7da3237dad7aebf204b34869.html
- External independent read-only comparison of the OLD real preview `e4795548645a1dabc379a911.html` and new one verifies:
  - Original 2 article titles and order, two source DOI, surname 仇友爱 unchanged.
  - Old total 52 `img` URLs; new total **53** because one broken table excerpt now comprises two separate full-page source images.
  - Exactly **2 old broken image URLs removed, exactly 3 newly uploaded image URLs added**, all other **50** URLs *byte-identical and in the same order* (49 old body not all? 47 unmodified science + two covers + one Gallery QR).
  - New image captions “完整镍催化循环工作模型”、“完整原表上页”、“续页，SI 第19页” present; old “Table S11（节选）” visible caption no longer present.
- Neither Gallery 08:00 release nor any image outside this 2-figure repair was changed, **no group/public send**.

## Final user-visible answer
已直接替换到微信原草稿，完整 Fig. 5e 和 SI Table S11 上下两页均能在文章对应段落显示；没有重新绘制化学结构；其余正文、封面、图片及作者署名未改。固定 IP 微信接口 `draft/update` 与 `draft/get` 均成功，原草稿 ID 没变、未群发。

最新真实预览：https://relay.gczhouwld.com/wechat-preview/7da3237dad7aebf204b34869.html
