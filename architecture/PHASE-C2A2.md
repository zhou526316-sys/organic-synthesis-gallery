# Phase C2a.2 — observer diagnostics before C2b activation

Date: 2026-10-04 Asia/Shanghai.

C2a.1 successfully delivered the read-only architecture observer, but the first real installed-browser gate observed new capture reports without an architecture `verified_snapshot`. That evidence is insufficient to decide whether the browser had not updated or whether the observer itself failed.

C2a.2 is diagnostic-only. It does **not** filter the acquisition queue and does not change literature membership.

## Changes

- Standalone userscript install metadata advances to **6.2.23**.
- Self-contained Bridge loader advances to **2.2.41**.
- Capture protocol remains **6.2.20**.
- Controller/Worker protocol remains **2.2.39**.
- Runtime constant `INSTALL_REVISION=6.2.23` is included in the existing diagnostic context.
- The latest observer attempt is stored separately from the last verified membership snapshot.
- Successful attempts add `architecture_membership / observer_ok`.
- Failed attempts add `architecture_membership / verification_failed` with a redacted short error.
- Existing `architecture_membership / verified_snapshot` remains unchanged and still represents only a successful verified membership.

A failed observer never clears a previously verified snapshot, removes a DOI, changes task ranking, or enables C2b.

## C2b gate

C2b remains disabled until real installed-browser evidence proves a current verified snapshot matching the current public architecture delivery. If C2a.2 reports `verification_failed`, the exact sanitized reason must be corrected first. If reports show an older install revision, update delivery rather than weakening validation.
