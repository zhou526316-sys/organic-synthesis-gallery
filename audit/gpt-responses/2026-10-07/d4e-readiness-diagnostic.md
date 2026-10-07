Beijing time: 2026-10-07
Context: read-only D4e readiness diagnostic
Added a read-only GitHub Actions diagnostic that reads aggregate D1 watermarks and existing Worker status/public surfaces. It performs no D1 writes and no Worker deploy. It reproduces snapshotSourceReady/strictReady checks and records which exact invariant is false.
