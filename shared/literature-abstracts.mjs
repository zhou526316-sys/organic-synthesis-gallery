// Canonical, DOI-bound ORIGINAL abstract metadata; not generated paper summaries.
export const ABSTRACT_SCHEMA = 'gallery-literature-abstracts-v1';
export const ABSTRACT_SOURCES = new Set(['crossref','openalex','europepmc']);
export function normalizedDoi(value) {
  const d=String(value||'').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
  return /^10\.\d{4,9}\/[a-z0-9._;()/:-]+$/i.test(d)?d:'';
}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',
  alpha:'α',beta:'β',gamma:'γ',delta:'δ',mu:'μ',pi:'π',times:'×',minus:'−'};
export function cleanAbstract(value) {
  if(typeof value!=='string'||!value.trim())return '';
  const plain=value
    .replace(/<\/?(?:jats:)?(?:title|p|sec|abstract|list|list-item|li|br|div|h[1-6])\b[^>]*>/gi,' ')
    .replace(/<[^>]{0,1000}>/g,'')
    .replace(/&(#x[0-9a-f]{1,8}|#[0-9]{1,9}|[a-z]+);/gi,(_,token)=>{
      if(token[0]==='#'){
        const hex=token[1]?.toLowerCase()==='x',n=Number.parseInt(token.slice(hex?2:1),hex?16:10);
        return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)
          ?String.fromCodePoint(n):'';
      }
      return entities[token.toLowerCase()]??' ';
    })
    .replace(/[\u0000-\u001f]+/g,' ')
    .replace(/\s+/g,' ').trim()
    .replace(/^abstract(?:\s*[:.]\s*|\s{1,3})(?=[A-Za-z])/i,'');
  return plain.length>=35 && plain.length<=12000 ? plain : '';
}
export function openAlexAbstract(index) {
  if(!index||typeof index!=='object'||Array.isArray(index))return '';
  const entries=Object.entries(index);
  if(!entries.length||entries.length>5000)return '';
  const positions=new Map();let highest=-1;
  for(const [word,raw] of entries){
    if(typeof word!=='string'||!word.trim()||word.length>100||!Array.isArray(raw)||raw.length>3000)return '';
    for(const i of raw){
      if(!Number.isSafeInteger(i)||i<0||i>3500||positions.has(i))return '';
      positions.set(i,word);if(i>highest)highest=i;
    }
  }
  if(highest<7||highest>3500||positions.size!==highest+1)return '';
  return cleanAbstract(Array.from({length:highest+1},(_,i)=>positions.get(i)).join(' '));
}
const groups=[
  {when:/\blmct\b|ligand[\s-]*to[\s-]*metal\s+charge[\s-]*transfer/i,terms:['lmct','ligand-to-metal charge transfer','配体到金属电荷转移']},
  {when:/\bchiral\s+phosphoric\s+acids?\b|phosphoric\s+acid\s+catalys/i,terms:['chiral phosphoric acid','手性磷酸','cpa catalysis']},
  {when:/\baxial\s+chirality\b|\batropisomer(?:ic|ism|s)?\b|\batroposelectiv/i,terms:['轴手性','axial chirality','atropisomer']},
  {when:/\bcerium\b|\bceric\b|\bce\s*\(\s*(?:iii|iv|3|4)\s*\)/i,terms:['铈催化','cerium catalysis']},
  {when:/\bphotoredox\b|photocataly(?:tic|sis)\b/i,terms:['光氧化还原','photoredox']},
  {when:/\belectrochemical\b|\belectrosynthes/i,terms:['电化学','electrochemical']},
  {when:/\boxidative\s+cycliz/i,terms:['氧化环化','oxidative cyclization']},
  {when:/\bepoxidation\b|\bepoxide\b/i,terms:['环氧化','epoxidation']},
  {when:/\bdecarboxylative\b|\bdecarboxylation\b/i,terms:['脱羧','decarboxylation']},
  {when:/\bcross[\s-]*coupling\b/i,terms:['交叉偶联','cross-coupling']},
];
export function abstractSearchTerms(title,abstract){
  const hay=[title,abstract].filter(Boolean).join(' '),terms=[];
  for(const group of groups)if(group.when.test(hay))terms.push(...group.terms);
  return [...new Set(terms)];
}
export function validAbstractRecord(doi,row){
  return Boolean(normalizedDoi(doi)===doi&&row&&typeof row==='object'
    &&ABSTRACT_SOURCES.has(row.source)
    &&typeof row.abstract==='string'&&cleanAbstract(row.abstract)===row.abstract
    &&typeof row.sourceUrl==='string'&&/^https:\/\//i.test(row.sourceUrl)
    &&typeof row.verifiedAt==='string'&&!Number.isNaN(Date.parse(row.verifiedAt)));
}
export function emptyAbstractRegistry(){
  return {schemaVersion:ABSTRACT_SCHEMA,generatedAt:null,
    coverage:{inScope:0,ready:0,missing:0,unchecked:0,sources:{}},items:{},unavailable:{}};
}
