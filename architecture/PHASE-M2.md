# Phase M2 — bounded read-only public media inventory

Date: 2026-10-07 Asia/Shanghai.
Status: public inventory path bounded to rendered cards and separated from repair-write authority.

## Problem

The Gallery delayed media inventory request was not truly bounded. It derived its DOI list from the in-memory paper corpus, which can be much larger than the rendered result window. The same public route also created repair-state rows unless callers explicitly opted into read-only mode.

That mixed three concerns:

- public card rendering;
- hidden Tampermonkey staging;
- media repair-state mutation.

## Contract

The public Gallery now builds inventory only from `#gallery .toc-slot[data-doi]`, which is already bounded by the responsive result window (24 desktop / 2 mobile). The request explicitly sends `readOnly:true`.

The Worker treats every non-read-only inventory call as a write-authority operation and requires the existing write authorization before `ensureRepairRows()` may run.

This preserves hidden staging for the currently rendered page while preventing ordinary public visitors from mutating media repair state or causing inventory work proportional to the full Hot corpus.

Tampermonkey acquisition authority and media promotion rules are unchanged.
