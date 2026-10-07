# Response synchronization

北京时间：2026-10-07 09:55 +08:00
上下文：RSC v14 exact-DOI search fallback 经过核心浏览器回归与 window guard 验证后，因 main 并发更新而采用原子移植。

## Verified before transplant

- Core Target journal Tampermonkey capability regression: success on RSC search-fallback logic.
- Tampermonkey window guard regression: success after 2.2.58 / 6.2.39 version bump.
- Main divergence review: no concurrent main commit touched the 9 v14 files.
- Green Chemistry 10.1039/d6gc03161g already produced a v13 attempt:
  - installRevision=6.2.38
  - publisherMediaRevision=20261007-rsc-issue-pdf-v13
  - TOC still not_found because articlelanding/articlehtml exposed no issue route.
  - both official PDF routes returned HTTP 403; no access-control bypass is attempted.
- v14 adds exact-DOI same-origin RSC search-results fallback and still rejects *.pdf.gif previews.

## Release target

- Bridge 2.2.58
- install 6.2.39
- publisher media revision 20261007-rsc-search-fallback-v14
