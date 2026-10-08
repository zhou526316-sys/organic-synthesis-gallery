/**
 * A Zenodo record has an independent repository DOI, not a primary article DOI
 * issued by any of the target journals. Archived review metadata can mislabel
 * the record's journal; such a label is not source-family evidence.
 *
 * This only disambiguates historical disappearance checks. It does NOT remove
 * candidates from the Crossref/OpenAlex union, alter semantic decisions, or
 * bypass publisher/source-family health failures.
 */
export function isStandaloneRepositoryDoi(value) {
  return /^10\.5281\/zenodo\.\d+$/i.test(String(value ?? '').trim());
}
