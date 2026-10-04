# DOI deep-link auto-summary reliability fix

User reported that opening a shared paper still required manually tapping the AI summary button.

Root causes addressed:
- Older or cached share links may contain only `?doi=...` and lack the newer `summary=1` flag.
- The previous implementation dispatched a custom event and could mark the summary request complete before a reliable direct opener was available.

Fix merged in PR #282:
- Any valid DOI deep link now auto-opens the existing AI summary by default.
- `summary=0` is the explicit opt-out.
- Newly generated share links still include `summary=1`.
- `gallery-paper-actions` now exposes `openSummaryFromDeepLink()` and the deep-link runtime waits for the custom element definition before invoking it.
- The runtime verifies that the summary drawer actually appeared before considering the request complete and retries otherwise.
- The existing 20-second DOI-card highlight remains unchanged.
- Card sharing CI now verifies backward compatibility using a plain old-style `?doi=...` URL with no `summary=1`.

Validation:
- PR head Card sharing CI: success.
- Main Card sharing CI after merge: success.
- Worker frontend sync after merge: success.
- GitHub Pages deployment after merge: success, including canonical/Pages origin verification.

Merge commit: `c976bbc6d91a7e3fa2a382b2af82d385af525b1e`.
