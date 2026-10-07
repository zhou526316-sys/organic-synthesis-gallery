# Response synchronization

北京时间：2026-10-07 10:03 +08:00
上下文：RSC v14 canonical 发布与客户端版本核验。

## Verified

- GitHub Pages build/deploy for a commit containing v14 completed successfully.
- https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js now serves:
  - Bridge 2.2.58
  - install 6.2.39
  - publisher media revision 20261007-rsc-search-fallback-v14
  - exact-DOI RSC /en/results?searchtext= fallback present.
- Worker direct origin also serves the v14 bundle.
- The newest active browser report (10.1021/acs.joc.6c01736) still reports:
  - installRevision=6.2.38
  - publisherMediaRevision=20261007-rsc-issue-pdf-v13
  - controllerRevision=2.2.41
- Therefore the browser Tampermonkey client has not yet auto-updated to v14 and requires one manual overwrite/update.
- Green Chemistry 10.1039/d6gc03161g has already run once under v13 and both official PDF routes returned HTTP 403; no access-control bypass is attempted.
- Chemical Science 10.1039/d6sc06421c has not yet produced a fresh v13/v14 retry.
