// Presentation-only corrections for English titles independently checked
// against Crossref and the actual publisher DOI landing page on 2026-10-10.
// Never overwrite a valid canonical title; production literature admission and
// content-addressed records are still governed by the 08:00 release contract.
const VERIFIED = Object.freeze({
  '10.1021/acs.orglett.6c02216': Object.freeze({
    title: 'Cobalt/Photoredox Dual-Catalyzed Alkylation of Indole with Unactivated Alkenes',
    publisherUrl: 'https://pubs.acs.org/doi/10.1021/acs.orglett.6c02216',
  }),
  '10.1038/s44160-026-01106-4': Object.freeze({
    title: 'β-Selective C(sp3)–H functionalization of alkyl boronates using photoredox catalysis',
    publisherUrl: 'https://www.nature.com/articles/s44160-026-01106-4',
  }),
  '10.1038/s41467-026-77437-9': Object.freeze({
    title: 'Zipper polydefluorination-monoborylation of perfluoroalkyl chains',
    publisherUrl: 'https://www.nature.com/articles/s41467-026-77437-9',
  }),
});

export function verifiedHistoricalTitle(doi) {
  return VERIFIED[String(doi || '').trim().toLowerCase()]?.title || null;
}
export function verifiedHistoricalTitleSources(doi) {
  return VERIFIED[String(doi || '').trim().toLowerCase()] || null;
}
