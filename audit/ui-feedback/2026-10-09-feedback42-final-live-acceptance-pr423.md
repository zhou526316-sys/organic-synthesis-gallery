# Feedback #42 — final live acceptance after visible-menu clipping fix

Beijing time (record): 2026-10-09 01:34:51 (Asia/Shanghai)
Context: user-approved Gallery interface feedback #42; previous iterations PR #419 and PR #423.
Outcome: **production live acceptance PASSED**. Existing feedback #40/#41 unchanged.

## Cause and scope

- Initial complaint: the reading-status management menu opens on the wrong side of the trigger and is clipped/hard to operate.
- PR #419 merged as `da6a08ff648344ec7b4d08efc1c9f1cad66579c4`, fixed available-side selection and viewport bounding logic.
- The first production browser QA revealed that the menu had correct geometry and `data-placement="above"`, but was not actually painted/hit-testable. CSS `content-visibility:auto` from actively used `src/performance-runtime.ts` placed the open drawer inside a paint-contained card.
- PR #423 merged as `465e65d0d427dca80ca714e3391ad247c73fa5f9`. Only `src/performance-runtime.ts` and `tests/architecture-frontend.spec.ts` changed: `.gallery .card.user-action-open` temporarily uses `content-visibility:visible`, `contain:none`, `overflow:visible`, `position:relative`, `z-index:40`; all other cards retain normal lazy paint; when closed, `user-action-open` is removed and `auto` is restored.
- No DOI data/TOC/PDF/media acquisition, no 08:00 formal release, no #40/#41 rewrite, and no production user-state modification.

## CI and deployment

- PR #423: https://github.com/zhou526316-sys/organic-synthesis-gallery/pull/423 — 16/16 checks passed, including Required quality gate and Playwright interaction regression (19/19 Hot/Archive cases, with #42 mobile+desktop painted-frontmost checks).
- Worker frontend deployment: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37815796764 — completed success.
- Worker sync: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37815767903 — completed success.
- Pages build + production deployment: https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37815767767 — completed success (34/34 build steps plus deploy).

## Real-domain four-way browser acceptance

Automated one-shot browser run:
https://github.com/zhou526316-sys/organic-synthesis-gallery/actions/runs/37817270827
Job ID: 113448982652
Screenshots artifact: 11567327881, `feedback42-live-screenshots-37817270827` (4 PNG screenshots).

All **4/4** scenarios passed against `https://gallery.gczhouwld.com`:

| Viewport | Desired placement | Actual placement | Popup bounds (CSS px, top–bottom) | Painted/topmost | Status choice buttons |
|---|---|---|---|---|---|
| 390×844 | above | above | 14.656–534.656 | true | 3 |
| 390×844 | below | below | 189.656–709.656 | true | 3 |
| 1280×900 | above | above | 33.984–593.984 | true | 3 |
| 1280×900 | below | below | 199.984–759.984 | true | 3 |

For each run, the menu was within the viewport, the trigger remained associated with the status drawer, popup scrolling was enabled, and `document.elementFromPoint` targeted `GALLERY-PAPER-ACTIONS` rather than background content. This confirms actual paint/hit access, not just geometry. The test intercepted any mutating API calls (1–3 per scenario); it never selected a status or wrote account data.

## Follow-up contract

No additional functional change is needed for #42 on this evidence. New complaints should first be reproduced and user-approved under PROJECT_RULES.md, rather than reopening or reverting PR #423 automatically. Production feedback status was not mutated by these diagnostics.
