# Phase D3c4b — isolated production V3 write canary

Date: 2026-10-07 Asia/Shanghai.
Status: canary harness installed; global V3 write activation remains disabled.

## Scope

D3c4b proves the production write path without exposing normal users to it.

The production Worker keeps:

- \`USER_LIBRARY_V3_SHADOW_ENABLED=1\`
- \`USER_LIBRARY_V3_READ_ENABLED=1\`
- \`USER_LIBRARY_V3_WRITE_ENABLED=0\`
- \`USER_LIBRARY_V3_WRITE_CANARY_USER_ID=__gallery_v3_write_canary__\`

The reserved canary id is not a normal user id. It has no persistent account or session. The manual canary workflow creates it only for the duration of one run and deletes it afterwards.

## Production canary sequence

The workflow \`.github/workflows/user-library-v3-write-canary.yml\` is manual-only and requires the literal confirmation \`D3C4B\`.

Before any write it proves:

1. V3 shadow and bounded reads are enabled;
2. global V3 writes are still disabled;
3. shadow backfill is complete;
4. legacy/V3 head counts match and revision mismatches are zero;
5. the canonical frontend contains both the D3c3 V3 read client and D3c4a mutation client.

It then creates a temporary D1 user and a ten-minute bearer session and exercises the real public account API:

1. V3 head at revision 0;
2. V3 mutation at expected revision 0;
3. V3 head read at revision 1;
4. bounded V3 page read;
5. V3 delta from revision 0;
6. D3b compatibility \`account-pull\`;
7. deliberate stale V3 mutation and required HTTP 409 conflict;
8. legacy \`account-save\` fence after per-user V3 authority has been claimed.

The mutation also proves global-state mirroring, paper-state mirroring and metadata mirroring.

## Cleanup invariant

Cleanup runs with \`if: always()\`.

The workflow explicitly deletes all canary rows and then the temporary user. It verifies zero residue in:

- users / sessions;
- V3 head, row, commit, change, shape, authority and shadow-sync tables;
- D3b compatibility rows/head;
- the legacy monolithic state table.

A failed canary must therefore fail closed without leaving a V3-authoritative test account behind.

## Activation boundary

A successful canary is evidence that production D3c4a mechanics are safe for one isolated account. It does **not** itself enable global V3 writes.

Global \`USER_LIBRARY_V3_WRITE_ENABLED=1\` remains a separate production cutover and must not occur until a successful D3c4b canary artifact has been reviewed.
