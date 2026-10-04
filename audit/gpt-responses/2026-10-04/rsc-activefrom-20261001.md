# 2026-10-04 — Chemical Science / Green Chemistry activation boundary

User instruction: Chemical Science / Green Chemistry 只保留 2026-10-01 之后的文献。

Implemented as canonical journal activation policy:
- Chemical Science: activeFrom = 2026-10-01
- Green Chemistry: activeFrom = 2026-10-01
- Chem remains activeFrom = 2026-09-19

No publication schedule changed. No production literature or media was added or removed by this policy update.

Implementation:
- registry commit: 84eecf26e5cc928e99c54a91d31a70beae43642b
- completeness guard commit: ad8845b5de6343e7bb6efaf8b4cb6412499061a7
- audit run: 37203791005, success
- capability registry commit: 9aee0e06b1916e7262fed6ad7731b99c8d2ccd0a
- state sync commit: 555db69926c77fec98d415c1a7140b46d406599e

Fresh audit generatedAt: 2026-10-04T12:56:22.564Z
- total unresolved: 53
- Chem unresolved: 8
- Chemical Science unresolved: 12
- Green Chemistry unresolved: 8
- Chemical Science / Green Chemistry candidates before 2026-10-01 remaining in effective compact: 0
- pre-2026-10-01 Chemical Science / Green Chemistry records removed from effective universe by the policy change: 99 total (66 Chemical Science + 33 Green Chemistry)
- criticalSourceFailures: 0
- sourceFamilyGaps: 0
- sourceCoverageAnomalies: 4 remain visible
- verifiedThrough remains held; this change does not assert semantic closure

The September RSC records were discovery candidates, not production cards, so this is not a production deletion event.
