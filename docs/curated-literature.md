# Curated literature maintenance

Post-migration, assistant-audited additions live in `public/curated-supplement.json`. Every accepted record should include publisher-verified first-online date, DOI, exact English title, and a pre-generated Simplified Chinese `titleZh`. The GitHub Pages build DOI-deduplicates this layer against historical datasets and merges `titleZh` into the static translation table before publishing.
