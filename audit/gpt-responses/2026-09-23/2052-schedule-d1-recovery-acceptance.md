# Scheduled D1 recovery acceptance

Beijing time: 2026-09-23 20:52
Context: Organic Synthesis Gallery / Cloudflare D1 quota recovery

User approved the proposed next step.

Created a one-time read-only production acceptance check for Beijing time 2026-09-24 08:00.

The check will verify:
- https://zhou526316-sys.github.io/organic-synthesis-gallery/site-stats.html
- https://api.gczhouwld.com/api/user-ui/site-stats
- https://api.gczhouwld.com/api/user-ui/reader-stats
- the stats page still uses the production API
- the 60-second automatic polling remains removed
- site and reader statistics fail independently rather than blocking the whole page
- D1 rows-read usage if it can be observed

The scheduled task is read-only and must not modify production code or data.
