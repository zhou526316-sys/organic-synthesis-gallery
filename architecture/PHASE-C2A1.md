# Phase C2a.1 — observer delivery and real-browser evidence

Date: 2026-10-04 Asia/Shanghai.

C2a introduced a read-only architecture membership observer, but the user's common installation surface is the self-contained VPN Bridge. C2a.1 closes the delivery/evidence gap without enabling task filtering.

## Delivery

- Standalone `toc-mainline.user.js` install metadata advances from 6.2.21 to 6.2.22.
- The self-contained Bridge loader advances from 2.2.39 to 2.2.40.
- Capture protocol remains `VERSION = 6.2.20`.
- Controller/server compatibility remains `2.2.39`.
- No Worker protocol or stored capture/checkpoint format changes.

This separation is intentional: installer versions can advance so Tampermonkey fetches a new bundle while the capture protocol remains compatible with the existing Worker.

## Real-browser evidence

A successful architecture observer already stores a compact local snapshot. C2a.1 adds one read-only diagnostic trace event to the existing Tampermonkey report outbox when a normal capture report is produced:

`stage=architecture_membership, event=verified_snapshot`

The event contains only non-secret architecture identity/counters:
- membership revision/serial
- publication slot
- catalog ID and membership hash
- lifecycle as-of date/cutoff
- member, Hot and Archive counts
- local verification timestamp

No new endpoint, credential or server write class is introduced. The report uses the existing authenticated diagnostic upload and R2 report history. Absence of the event is not treated as membership failure or paper removal.

## Gate to C2b

C2b task filtering remains disabled until a real installed browser report shows a verified current architecture snapshot matching the current public delivery. CI/browser fixtures remain necessary but are not substituted for that production-browser evidence.

C2a.1 does not alter queue membership, job ranking, inventory scope, captures, summaries, frontend rendering, user state, D1/R2 schemas or publication schedules.
