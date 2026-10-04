# Phase C2a.2 — observer failure diagnostics

Date: 2026-10-04 Asia/Shanghai.

C2a.1 is deployed and real browsers are producing capture reports, but the production gate has not observed an architecture membership verified snapshot. C2a.2 improves observability only. It does not enable C2b task filtering.

## Behavior

The standalone userscript moves to 6.2.23 and the self-contained Bridge to 2.2.41. Capture protocol remains 6.2.20 and controller/server compatibility remains 2.2.39.

Every architecture observer attempt stores a separate local status:
- verified: compact catalog/membership counters and publication identity;
- failed: a sanitized bounded error string and install version.

Existing successful membership state remains separate and is not erased by a later observer transport failure.

When an ordinary Tampermonkey diagnostic report is already being produced, it now appends an `architecture_observer` event:
- `verified`, or
- `verification_failed`.

No new report endpoint or write type is introduced. No raw page data, credentials, cookies, authorization headers or object payloads are added. The existing report sanitizer and authenticated report transport remain authoritative.

## Production gate

C2b remains disabled. The next real installed-browser report must either:
1. contain `architecture_membership / verified_snapshot` matching the verified public catalog, satisfying the gate; or
2. contain `architecture_observer / verification_failed`, making the blocker diagnosable.

Absence of both events after C2a.2 deployment indicates an install/update/execution-path problem rather than a successful membership observation.

No queue filtering, frontend Hot/Archive switch, user-state migration, storage migration or publication schedule change is included.
