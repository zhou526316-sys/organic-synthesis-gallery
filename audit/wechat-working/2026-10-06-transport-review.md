# 2026-10-06 WeChat transport/readback review

Status: **PASS**

Reviewed WeChat draft media ID: `KhELYUzvwADwB_l1xH1SWFv31tB1FbKXF89D7ZHLK2znutU4BOGt5XD22WOo65yQ`

Publisher run: `37420964420`  
Publisher head: `48c9e2fce8ea8ee8de3047ee0dc5699ae1853a3c`  
Publisher result: `draft_update` / HTTP 200 / `draft_readback=ok`  
Receipt generated: `2026-10-06T05:58:37.976327Z`

Preview:
https://relay.gczhouwld.com/wechat-preview/46996052560b30137c073a13.html

## Readback checks

- Article count: 2.
- Article 1 title matches the reviewed daily edition.
- Article 2 title matches the reviewed Nature/Hyster retrospective.
- Daily paper count: 29.
- Daily and retrospective take-home sections are both present.
- External FRET and intra-enzyme FRET sections/captions are both present.
- Lenacapavir application retains `82% 分析收率、98:2 e.r.`.
- Standard creation notice appears twice; standard originality notice appears twice.
- Figure captions: 15 `原文 Fig.` captions + 1 `原文 Table 1` caption = 16 reviewed body evidence images.
- Preview exposes 19 image URLs total. This is consistent with 16 reviewed body evidence images + 2 WeChat cover/thumb images + 1 Gallery QR image.
- All 19 returned image URLs are on the WeChat `mmbiz.qpic.cn` CDN.
- The obsolete `hyster-plp-photoenzyme-retrospective-cover.jpg` path is absent from the readback.
- Both source links are present: the 2026-10-06 Gallery edition and the Hyster DOI landing entry.

## Non-blocking fallback

The compact “网页今日新增卡片” block rendered the four selected paper cards as text-only cards in this readback because optional Gallery miniature visuals were not returned. The four titles/DOIs and QR entry remain intact. This does not affect the reviewed scientific body figures, covers, or article text and is recorded as a later presentation optimization rather than a reason to overwrite the approved draft again.

## Final decision

**Transport/layout QA PASS.**

The October 6 draft has now passed:
1. text-only review;
2. images-only review;
3. source-fingerprint gate;
4. WeChat draft write;
5. `draft/get` readback;
6. combined preview content/image-link audit.

Do not modify or re-sync this draft again unless a new editorial change is intentionally introduced; any such change must reopen the pre-draft gate.
