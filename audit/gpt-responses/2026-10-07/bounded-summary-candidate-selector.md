Beijing time: 2026-10-07
Context: long Gallery architecture boundedness audit — summary candidate discovery

Added D2b2 bounded D1 selector:
- 64 rows/page;
- max 4 pages / 256 evidence rows;
- exact preferred DOI query;
- SQL join only for jobs matching scanned evidence rows;
- explicit 409 window-exhausted response instead of false empty.

The legacy full-set indexed selector remains shadow-only and the production summary-review selector remains legacy R2; no production candidate-selection authority changed.
