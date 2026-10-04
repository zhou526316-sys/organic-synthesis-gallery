# Phase C2a — Tampermonkey membership observer

Date: 2026-10-04 Asia/Shanghai.

C1 is live and delivery-verified. C2a makes the distributed browser controller **observe** that exact public architecture generation without changing job selection.

## Safety boundary

- Userscript install metadata advances to 6.2.21 so Tampermonkey can receive the observer.
- Capture protocol remains `VERSION = 6.2.20`; Controller remains `2.2.39`. Existing checkpoints, Worker capability contract and capture receipts are not migrated.
- The observer fetches current `release-delivery.json`, verifies schema v2, hashes the raw `architecture-v1/release.json`, then hashes the referenced membership/current/lifecycle objects.
- The complete legacy `queue.articles` DOI set must exactly equal the all-time membership set. Hot and Archive partitions together must exactly cover that membership.
- A verified snapshot is written only to a separate local observer state. Confirmed withdrawals are sticky; stale serials or conflicting same-serial membership are rejected.
- Automatic and manual runs record observer status in their summaries. They do **not** filter, reorder, delete, mark removed, clear progress or alter in-flight receipts in C2a.
- Failure of the observer cannot be interpreted as a removal. The existing capture scheduler remains authoritative until C2b is separately activated and tested.

## Why this is separate from C2b

The first production integration should prove that real user browser transport sees the same 785-paper all-time membership and lifecycle generation that Pages verified. Only after this observation path is stable may C2b filter *new* task selection to Hot plus explicit historical exceptions. The all-time registry will remain complete even then.

No frontend Hot/Archive switch, D1/R2 schema migration, publication-slot change or summary behavior is included here.
