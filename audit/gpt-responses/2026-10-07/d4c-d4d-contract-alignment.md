Beijing time: 2026-10-07
Context: align D4c parity contracts with D4d activation request
Updated the D4c snapshot-shadow deployment parity expectation from readConfigured=false to true because D4d activation has now been explicitly requested. D4c parity remains a separate semantic/source-stability proof; route tests now acknowledge the fail-closed snapshot branch ahead of the retained materialized compatibility branch.
