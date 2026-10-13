// DISCOVERY RANKING ONLY. Every DOI difference remains in the complete
// handoff regardless of this classifier. No include/exclude decisions here.
const SYNTHESIS_TERMS = /\b(?:synthes(?:is|iz\w*|e[sd]?)|syntheti\w*|cataly\w*|coupl\w*|functionaliz\w*|cycloadd\w*|cycliz\w*|cyclization\w*|annulat\w*|dearomat\w*|radical\w*|photoredox|photocataly\w*|electrochem\w*|asymmetr\w*|enantio\w*|stereoselect\w*|boryl\w*|silyl\w*|(?:di|tri|poly)?arylat\w*|(?:di|tri|poly)?alkylat\w*|(?:di|tri|poly)?aminat\w*|amidat\w*|(?:di|tri|poly)?acylat\w*|hydroaminat\w*|hydroalkylat\w*|hydrochlorinat\w*|hydrogenat\w*|olefinat\w*|metathesis|rearrang\w*|decarbox\w*|carboxylat\w*|glycosylat\w*|amination|cross[\s-]*electrophile|skeletal[\s-]+edit\w*|bond[\s-]+formation|substrate[\s-]+scope|late[\s-]+stage|photodimeriz\w*|annulation|ring[\s-]+expansion|ring[\s-]+opening|total[\s-]+synthesis)\b/i;
const CHEMISTRY_TOPIC = /\b(?:organic chemistry|synthetic chemistry|catalysis|stereochemistry|organometallic|photochemistry|chemical synthesis|organic synthesis)\b/i;
const CLEAR_NONRESEARCH = /\b(?:review|perspective|editorial|correction|retraction|news|commentary|protocol|issue publication information|(?:front|back) cover|table of contents|contents list)\b/i;
const STRONG_NON_SYNTH = /\b(?:patient|clinical|tumou?r|cancer|genome|transcriptome|neuron|mouse|mice|immune|battery|photovoltaic|semiconductor|geophysical|astronom\w*|machine learning|neural network)\b/i;
export function isHighRelevanceCandidate(candidate) {
  const title=String(candidate?.title||'');
  const type=String(candidate?.type||'');
  const abstract=String(candidate?.abstract||'');
  const topics=Array.isArray(candidate?.topics)?candidate.topics:[];
  const all=[title,abstract,...topics].join('\n');
  if(CLEAR_NONRESEARCH.test(title)||CLEAR_NONRESEARCH.test(type))return false;
  if(SYNTHESIS_TERMS.test(all)||CHEMISTRY_TOPIC.test(all))return true;
  if(candidate?.journal==='Organic Letters' && !STRONG_NON_SYNTH.test(all))return true;
  return false;
}
