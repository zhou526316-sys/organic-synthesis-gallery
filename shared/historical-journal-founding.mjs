/**
 * Historical founding bounds are separate from prospective activeFrom.
 * Conservative Jan 1 floors for year-only sources avoid accidentally
 * dropping papers in a journal's first publication year.
 * These are edition bounds, NOT source-coverage completion evidence.
 */
const entries=[
  ['Nature',1869,'https://www.nature.com/nature/volumes/1/issues/1'],
  ['Science',1880,'https://backissues.science.org/'],
  ['Nature Catalysis',2018,'https://www.nature.com/natcatal/volumes/1/issues/1'],
  ['Nature Synthesis',2022,'https://www.nature.com/natsynth/volumes/1/issues/1'],
  ['Nature Chemistry',2009,'https://www.nature.com/nchem/volumes/1/issues/1'],
  ['Nature Communications',2010,'https://www.nature.com/articles/ncomms1011'],
  ['JACS',1879,'https://pubs.acs.org/toc/jacsat/1/1'],
  ['Angew',1962,'https://onlinelibrary.wiley.com/toc/15213773a/1962/1/1'],
  ['ACS Catalysis',2011,'https://pubs.acs.org/toc/accacs/1/1'],
  ['Organic Letters',1999,'https://pubs.acs.org/doi/10.1021/acs.orglett.3c04145'],
  ['Chem',2016,'https://crosstalk.cell.com/blog/animating-chems-sustainability-goals'],
  ['Chemical Science',2010,'https://pubs.rsc.org/en/content/articlelanding/2010/sc/c005351c'],
  ['CCS Chemistry',2019,'https://www.chemsoc.org.cn/a2987.html'],
  ['Science Advances',2015,'https://pmc.ncbi.nlm.nih.gov/articles/PMC5462495/'],
  ['Green Chemistry',1999,'https://pubs.rsc.org/en/content/articlelanding/1999/gc/a807961g'],
  ['JOC',1936,'https://pubs.acs.org/toc/joceah/1/1'],
];
export const HISTORICAL_FOUNDATIONS=Object.freeze(Object.fromEntries(entries.map(([name,year,publisherEvidence])=>[
  name,Object.freeze({name,year,conservativeFloor:String(year)+'-01-01',publisherEvidence,
    issueReconciliation:'not_yet_verified',noDoiReconciliation:'not_yet_enumerated'})
])));
export function historicalFoundation(journal){
  const name=typeof journal==='string'?journal:journal?.name;
  const value=HISTORICAL_FOUNDATIONS[name];
  if(!value)throw Error('unknown_historical_journal_founding:'+String(name));
  return value;
}
export function historicalIssnsForRange(journal,range){
  if(!Array.isArray(journal?.issns)||!journal.issns.length)throw Error('historical_issns_missing');
  const start=String(range?.from||'');
  const end=String(range?.to||'');
  if(!/^\d{4}-\d\d-\d\d$/.test(start)||!/^\d{4}-\d\d-\d\d$/.test(end)||start>end)
    throw Error('invalid_historical_issn_range');
  // The international English edition started in 1962. Its 1962-1997 ISSN
  // predates today's Angew International Edition identifiers. Do not use
  // the German mother-journal 1888 history as this edition's founding date.
  if(journal.name==='Angew'&&start<'1998-01-01')
    return end<'1998-01-01'?['0570-0833']:[...new Set([...journal.issns,'0570-0833'])];
  return [...journal.issns];
}
export function historicalPeriodApplicable(journal,range){
  return String(range?.to||'')>=historicalFoundation(journal).conservativeFloor;
}
