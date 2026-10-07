# Phase F4 — summary-only DOM literature registry

Date: 2026-10-07 Asia/Shanghai.
Status: full all-time DOI membership removed from DOM diagnostics.

## Problem

The architecture reader correctly keeps complete all-time DOI membership for generation/revision validation. The frontend then duplicated that entire array into a hidden JSON script node named `gallery-literature-doi-registry`.

That turned a correctness registry back into a page payload and made DOM/string memory grow with the all-time literature corpus.

## Fix

The diagnostic node remains for compatibility, but schema version 2 contains only:

- scope;
- complete flag;
- total count;
- timestamp;
- `materializedDois:false`.

No DOI array is serialized into the DOM.

The complete membership remains available only inside the verified architecture reader where it is needed for correctness checks. Hot/Archive search, exact DOI resolution and indexed-result fencing are unchanged.
