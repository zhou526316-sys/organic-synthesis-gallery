Beijing time: 2026-10-07
Context: long Gallery architecture boundedness audit — media path

Found and fixed a corpus-scale query in normal public media reads. loadMediaRows previously grouped the entire current toc_assets corpus by content_hash on every media batch/inventory call. Duplicate detection now first derives hashes from the requested DOI rows and counts owners only for those hashes in bounded chunks. Global duplicate correctness is preserved while unrelated corpus-wide aggregation is removed. No acquisition or media-promotion authority changed.
