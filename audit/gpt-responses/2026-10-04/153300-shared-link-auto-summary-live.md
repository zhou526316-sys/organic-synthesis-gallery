# Shared link auto-summary

User requested that recipients who click a shared literature card should not only land on the DOI card, but should immediately see the article summary.

Implemented and merged in PR #279.

Behavior:
- New Gallery share URLs use `?doi=<DOI>&summary=1&sharev=<build>`.
- The DOI card is still promoted/located and retains the existing 20-second highlight.
- When `summary=1` is present, the matching `gallery-paper-actions` component receives `gallery-open-summary` and opens the existing AI summary drawer automatically.
- Normal DOI deep links without `summary=1` do not force the summary drawer.
- Generated poster QR codes and copied share links inherit the same summary-enabled deep link.
- Legacy `/share/*.html` redirect targets also add `summary=1`.

Validation:
- Card sharing CI for the feature head passed, including a Playwright assertion that the targeted paper's `.drawer.summary-drawer` becomes visible.
- Frontend build/typecheck passed on the feature head.
- PR was synced with current main before merge to avoid overwriting unrelated automated changes.

Merge commit: `4442f76076e339ea748f083c6c7062876a01eaca`.
