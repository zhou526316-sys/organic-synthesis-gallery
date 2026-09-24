# Gallery reviewed body publication — body5-20260924-1854-01

Recorded after production deployment and post-deploy live verification. This is a media-only result; it does not claim a full-corpus body-media review.

## Scope and result

- Repository baseline: `zhou526316-sys/organic-synthesis-gallery`, `main` only.
- Review packet: `body5-20260924-1854`.
- Canonical approved batch: `body5-20260924-1854-01`.
- PR: #216, `Media: preserve 19 individually reviewed body figures`.
- Exact batch result: `published=19` images across `5` currently included papers; `reviewed_pending_merge=0` for this exact batch.
- No literature cards, Chinese titles, inclusion scope, production literature data, userscript, or official TOC was added/removed/changed by this batch.
- Quarantine generation remains `1790082000000`.

## Individually reviewed and now published images

1. `10.1021/acs.orglett.6c03695`: Scheme 1–5 (5 images)
   - Scheme 1 SHA256 `873e18503ea8364f714fea0169c33cf873f9b286e9e916c73586a5a2717fbfc1`
   - Scheme 2 SHA256 `367db742a7dcbd7318a47e5bee7916a664e3db4e2b42d2add40f349660900811`
   - Scheme 3 SHA256 `d67cead0d8483462dfd27e3ef0efe8e5301a3388a2fa48a17ea443286d475c3f`
   - Scheme 4 SHA256 `75351a5ea23be2b76251ad8f726af0860e6ea0d8a8057f3430079020145c7ce7`
   - Scheme 5 SHA256 `91118e4c50d888eb3bc98a9987fcd54407c7ea38503d3c818760bbb914535f0d`
2. `10.1021/acs.orglett.6c03383`: Scheme 1–4 (4 images)
   - Scheme 1 SHA256 `6944233a67c50176ebbd91db53ebd48f5918b268c9c2f19e1d06ca1dcabab186`
   - Scheme 2 SHA256 `598bfdfad1729e0c1c8ed144052de5e7f67bef3f21a0cdbda148177ff61a097f`
   - Scheme 3 SHA256 `21013adcef0e061699d394242d8dcb4c268cb4cd2eccf5684999c4c65c1b64bf`
   - Scheme 4 SHA256 `8626cb003bf0ecfa41d8687b4ac05fe643057dd67ab89d51f9626e0f5ad453ba`
3. `10.1021/acs.orglett.6c03887`: Figure 1–4 (4 images)
   - Figure 1 SHA256 `7691787f8fd41dcdbe1faf0309c32d402c840904b4c644657cef59b83bd36a52`
   - Figure 2 SHA256 `a67de0c3ae9d8545c15f5a6c80b9e8e6a5a19566b24d858f2f25a45e8109d6ed`
   - Figure 3 SHA256 `de7a84d5ff73e1034e9140c657f8b6053bf2daa4e52f84ef70ff129ab629248a`
   - Figure 4 SHA256 `52ca698477fae259179b27679f9ed85cd904dbaf61d862dcea451bb245adb535`
4. `10.1021/acs.orglett.6c03912`: Scheme 2–4 (3 images)
   - Scheme 2 SHA256 `0f3f29fff8bf06583256500b3a2b95754e0c0abdf53c55cec5401fa8fa2f2742`
   - Scheme 3 SHA256 `32a4ec30ab6b2b6af7e761d1ca17e0fcabb1189365309aa5c4057a7e789a58f5`
   - Scheme 4 SHA256 `cfc6ed887025e835f493694345e60af68208ee751b5278c22216af62f15d95c1`
5. `10.1021/acs.orglett.6c03445`: Scheme 2–4 (3 images)
   - Scheme 2 SHA256 `6d2bf28a0133aed15af14386bdffd4f427880aa6ed12cfdcb4ba0174a1e6e126`
   - Scheme 3 SHA256 `3a666c97440ea7995dcdd015bbccaf376d2264304c1f1a0c0d0ba593329a3cfe`
   - Scheme 4 SHA256 `3b4344a182c6c9fd45c9e89e91ab351f5922627823e06b5e49e8a936d2034faa`

`10.1021/acs.orglett.6c03912` and `10.1021/acs.orglett.6c03445` remain article-level partial captures (`3/6`). Only the three exact stored, individually reviewed files listed above were approved and published; missing figures were not inferred, promoted, redownloaded, or replaced.

## Immutable source evidence and semantic review

- Reused controlled read-only evidence run: `35979551527`.
- Evidence artifact: `10799289278`.
- Evidence archive SHA256: `a1931f8275c8ecc89c2e950515f4213b5dffe40f73d670b9a1699da253b156af`.
- Evidence snapshot had `errors=[]` and preserved quarantine generation `1790082000000`.
- Each selected image was checked against task/page/article/source DOI, original figure label, independent caption, captureVersion/job identity, actual stored bytes/full SHA256, content-addressed R2 identity, article topic and image role, duplicate/recommended-image risk, format/decode/rendering, cross-DOI/source/hash collisions, and current same-ID/TOC state.
- Figure 1 for `10.1021/acs.orglett.6c03887` is a body Figure 1 only; it was not treated as a TOC. Existing official TOCs remain separate objects and were preserved.
- No server-side direct import/repair, publisher redownload, login/captcha bypass, R2/D1 production write, or userscript publication was used by the review/materialization path.

## Controlled materialization

- Materialization workflow run: `35983637522` — success.
- Materialization artifact: `10802150052`.
- Frozen media/PR head commit before merge: `156b939682956ecc75fe54c27f61c3e6b45e07df`.
- Exact approved files: `19`.
- Materialization reported no production write, no R2 write, no publisher request, and quarantine unchanged.
- PR #216 changed only the 19 frozen reviewed-body assets plus the bounded approval/review/audit records; no protected literature, frontend/source, userscript, or TOC file was part of the PR.

## Merge and production deployment

- Immediately before merge, `main` had advanced to `02bf42384b186227517ca95fc8b726ed6f691d29` through an unrelated audit-only change. Protected literature remained unchanged relative to the reviewed media branch.
- PR #216 was merged only after its existing media/quality gates were green and there was no active/queued formal literature producer requiring the media task to hold.
- Merge commit: `b3cc3c6f27c5ec6a88f6a5849ab807f5ca5fcc67`.
- Existing `PAGES_REFRESH` mechanism was used for the media-only deployment; no one-off publication code/workflow was introduced.
- Media-only Pages trigger commit: `d9ef508a034673d1fb674ef93760e701448d1430`.
- Production Pages run: `35992615911` — success, completed at approximately `2026-09-24 19:24:09 +08:00`.
- Literature authorization job: `107610034685` — success.
- Build job: `107610094459` — success, including literature baseline, media/static merge, authorization/static-media checks and build.
- Deploy job: `107610516483` — success.
- The successful `literature_authorization` path verified that the deployment did not mutate protected production literature outside the authorized fixed-slot release contract.

The 18:00 literature release had already produced a valid deployed atomic literature snapshot. Its later `sync_failed` bookkeeping state was investigated as a post-release quality/audit synchronization issue rather than a failed production Pages release; this media deployment did not repair or rewrite that literature state.

## Post-deploy live acceptance

- Read-only workflow: `Verify reviewed body figures live`.
- Run: `35992803070` — `completed/success`.
- Verification job: `107610640088` — success.
- Exact live verifier result at `2026-09-24T11:25:15.618Z` (`19:25:15.618 +08:00`):
  `BODY_LIVE_ACCEPTANCE {"result":"passed","checkedAt":"2026-09-24T11:25:15.618Z","files":301,"cards":5,"browserRenderingVerified":true}`
- This verification reads all approved reviewed-body assets from the deployed site, validates online media identity/bytes/SHA256, checks card/body figure identities, and verifies browser rendering while keeping TOCs distinct. The five target cards rendered successfully. The `files=301` value is the total approved reviewed-body set checked by that verifier, not a claim that 301 new files were published in this batch.
- Live-verification artifact: `10805151968` (`reviewed-body-live`).
- Artifact ZIP SHA256: `4db3dbfab9352967a00d2fd1d981c2eea15d80d5e6247681eabd3815dee0f18c`.
- Artifact size: `416428` bytes.

Therefore this exact batch is no longer merely staged/merged/approved: all 19 selected files have production deployment evidence plus successful post-deploy live-byte/card/browser verification, so their state is `published`.

## Concurrency and boundaries after deployment

After the media deployment, `main` continued to receive unrelated audit/static verification-file commits (including `416dc9ad63f9ee9374aa6672ff276160a2162dce` and later `2c4fd74cc4f9d6983a2ac8ae4596300bbea90f2f`). These later changes do not alter the reviewed batch's protected literature or exact published media evidence. This record does not claim that every staged/R2 body image or the entire corpus has been semantically reviewed; subsequent increments remain subject to the same per-image approval and deployment gates.
