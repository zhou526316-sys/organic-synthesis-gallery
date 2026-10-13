# Historical archive: approved comprehensive coverage and triage upgrade (2026-10-13)

This is a read-only/staging-only academic discovery and triage upgrade. It does
**not** publish, auto-approve, scrape old PDF/figures/SI, or alter the 08:00
fixed-slot authorizer. Reviewed, staged and published are different states.

## Dual registries

- Prospective journal \`activeFrom\` in \`shared/literature-journals.js\` remains
  untouched. The independent \`shared/historical-journal-founding.mjs\`
  contains conservative historical FIRST-YEAR floors and reference URLs.
  A year-only founding source uses January 1 of that year to avoid wrongly
  removing possible first-year papers.
- Angew refers to the International English Edition (1962 onward). The
  German parent journal dates to 1888 but is NOT silently merged into the
  English edition. 1962–1997 records need historical ISSN 0570-0833;
  production ISSNs remain untouched.
- Crossref / OpenAlex are metadata *source families*. A complete API window
  is not proof of complete publisher issue coverage. No-DOI pre-digital
  articles are not discoverable by the current DOI-only script. Both
  deficits are explicitly shown as pending in the triage ledger.

## Review queue

- Run \`HISTORICAL_STAGING_ONLY=1 HISTORICAL_STAGING_BRANCH=1 node scripts/historical-review-triage.mjs\`
  only on \`staging/historical-archive-nightly\` after merging latest main.
- Reads every complete root batch, in bounded resumable slices; checks the
  current published DOI list and independent double-reviewed manifest.
- Writes \`audit/historical-staging/review-queue/<root>.json\` and
  \`review-triage-ledger.json\` on the dedicated staging branch only.
- Every DOI is retained, including titles without obvious synthesis terms.
  Priority P0–P3 is a *review order*, never automatic acceptance or exclusion.
  Issue editorial/masthead records are marked \`suspected_nonresearch\`, not
  silently discarded. Missing/ambiguous publisher dates remain unverified.
- Root counts are **candidate occurrences**, not distinct eligible papers,
  and must never be presented as verified organic synthesis intake.
- Initial coverage may require multiple bounded runs. Re-sweeps incorporate
  new publication and review decisions without modifying source batches.

## Human/assistant DOI-specific science review gate

Every proposed admission requires exact article publisher source and first-online
date, bibliography and a scientifically independent first + challenge second
pass, including five paper-specific \`scopeAssessment\` fields. Inadequate
evidence stays pending. Only approved DOI can enter the existing next legal
Beijing 08:00 writer; historical rows remain out of Today/Hot/WeChat daily.
Pre-July \`metadata_only\`; July–September \`toc_only\`; existing media
must not be damaged. See \`docs/historical-backfill-media-contract.md\`.

## Future completion proof

For each journal / year / issue publish a read-only reconciliation ledger:
publisher issue rows, Crossref/OpenAlex rows, identity conflicts, suspected
nonresearch, verified reviewed include/exclude/pending, archived and live
searchable DOI, and no-DOI records held for stable bibliographic identity.
Never infer a zero from an inaccessible publisher issue or unverified metadata.
Archive/D1 availability requires genuine Pages and API readback, not
successful CI alone.
