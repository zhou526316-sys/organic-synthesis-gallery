Beijing time: 2026-10-04
Context: WeChat body-image fallback failed because Nature CDN returned HTML for Figure 2.

Resolution:
- Stop using Nature figure-CDN URLs as the authoritative image source for this featured paper.
- public/wechat-featured/2026-10-04.json now contains source PDF URL plus explicit high-resolution PDF render coordinates for Fig. 1-8.
- create-draft.py now:
  1. downloads/caches the source PDF or accepts --featured-pdf local path,
  2. renders the exact original PDF figure region at 4x with PyMuPDF,
  3. uploads those PNGs to WeChat media/uploadimg,
  4. uses rendered Fig. 1 as cover source,
  5. writes/updates the real draft,
  6. reads it back through draft/get,
  7. only then emits preview_url.
- No AI redraw or chemical structure reconstruction is used.

Commits:
- 7f30fe9e2e95df00bae205546314c17d317b030e featured figure PDF coordinates
- a3a45880f8fd112ebdc830142318f3eb8f559fcd PDF-render upload pipeline
