# Whole-history source-window & unique DOI coverage ledger

Stage-only \`scripts/historical-global-coverage.mjs\` reads each current complete
history batch's already-built reviewer shard. It deduplicates DOI *across*
source windows, records duplicate occurrences and published/review states,
and compares completed DOI-source root windows with planned periods from the
publisher-founded-journal map (which is separate from prospective activeFrom).

\`audit/historical-staging/global-coverage-ledger.json\` includes:
- sourceRootsPlanned and sourceRootsCompleted separately, by journal and year;
- source candidate occurrences, unique DOI and duplicate windows;
- status partitions already_published / two_pass_approved_awaiting_08 /
  evidence_pending / requires_two_pass_review / ambiguous;
- records with missing publisher first-online date and suspect non-article title;
- a full per-year expected vs done table, and current resume cursor;
- **publisherIssueMatchedRoots: 0** unless independently verified and
  explicitly implemented later. No-DOI legacy article coverage also remains
  unverified. Do NOT equate success of Crossref/OpenAlex windows with complete
  journal tables of contents or a historical DOI scope approval.

Neither this ledger nor the companion triage authorizes publishing historical
candidates or downloading copyrighted old figures, SI, PDFs, or full abstract.
Each accepted article still needs independent DOI-specific publisher evidence
and two-pass scope assessment and may be admitted ONLY by the existing Beijing
08:00 production writer. Pre-2026-07-01 metadata_only; Jul-Sep toc_only.
