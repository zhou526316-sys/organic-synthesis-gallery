# Completeness audit v2

The internal audit unions Crossref results across every configured ISSN with OpenAlex records for all ten target journals. There is no fixed top-N candidate cap. Potential synthesis gaps are retained for assistant review and are not silently counted as excluded. A historical window is not considered complete while source failures or unresolved potential gaps remain.
