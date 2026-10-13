// Crossref works date modes, including late journal metadata redeposits.
// Date filters are documented for Crossref REST /journals/{ISSN}/works.
export const CROSSREF_DATE_MODES=Object.freeze([
  'online','published','created','deposited'
]);
const FIELDS=Object.freeze({
  online:'online-pub-date',published:'pub-date',
  created:'created-date',deposited:'deposit-date'
});
export function crossrefModeQuery(mode,{queryStart,rescueStart,endDate}={}){
  if(!Object.hasOwn(FIELDS,mode))throw Error('invalid_crossref_discovery_mode:'+mode);
  const start=mode==='deposited'?rescueStart:queryStart;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate||'')||start>endDate)
    throw Error('invalid_crossref_date_window');
  const field=FIELDS[mode];
  return {mode,filterField:field,modeStart:start,
    filter:'from-'+field+':'+start+',until-'+field+':'+endDate};
}
export function wasRecentlyDeposited(candidate,start,endDate){
  const sources=Array.isArray(candidate?.sources)?candidate.sources:[];
  const date=String(candidate?.depositedDate||'');
  return sources.some(x=>String(x).endsWith(':deposited'))
    && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && date>=start&&date<=endDate;
}
