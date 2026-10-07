Beijing time: 2026-10-07
Context: D4d activation rollback hardening

First guarded activation correctly rolled back snapshot reads, but rollback verification was too weak and accepted legacy_raw_fallback. Current public health shows snapshot read=false, materialized read=true, while public site-stats is temporarily legacy_raw_fallback because materialized readiness is stale.

This change returns desired snapshot read to 0 and hardens rollback:
- repair materialized backfill/readiness after rollback;
- require materialized/raw watermark parity;
- require materialized compare same=true;
- require public site-stats readPath=materialized and generation=site-pageview-v2;
- persist per-attempt activation diagnostics for refresh/source-readiness and live-proof stages.

No second snapshot activation is requested by this commit.
