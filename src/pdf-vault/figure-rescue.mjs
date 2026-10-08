// Owner-only, browser-local PDF original-figure recovery.
// Never uploads PDF bytes or extracted images and never fabricates structures.
// A caption locator is a review hint, NOT a verified TOC/production asset.
export const PDF_RESCUE_SCAN_LIMIT = 24;
export const PDF_RESCUE_MAX_CANDIDATES = 48;
const DOI_PATTERN = /^10\.\d{4,9}\/[a-z0-9._;()/-]+$/i;
const DOI_TOKEN = /10\.\d{4,9}\/[a-z0-9._;()/-]+/ig;

export function normalizePdfRescueDoi(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[?#].*$/, '');
  return DOI_PATTERN.test(v) ? v : '';
}

function textLineGroups(content) {
  // PDF.js text items carry actual text and page coordinates. Coordinate
  // grouping avoids merging captions with adjacent multi-column paragraphs.
  const rows = [];
  for (const item of content?.items || []) {
    const str = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (!str) continue;
    const x = Number(item?.transform?.[4] || 0);
    const y = Number(item?.transform?.[5] || 0);
    const h = Math.max(1, Number(item?.height || 9));
    let row = rows.find(r => Math.abs(r.y - y) <= Math.min(4, h * 0.35));
    if (!row) { row = {y,parts:[]}; rows.push(row); }
    row.parts.push({x,str});
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>
    r.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(' ')
      .replace(/([-/])\s+([0-9a-z])/gi,'$1$2').replace(/\s+/g,' ').trim());
}

function captionFromLine(line) {
  if (!line || line.length > 460) return null;
  const m = /^(?:fig(?:ure)?\.?\s*|scheme\s*|chart\s*)(\d{1,2})\b(?:[\s.:\u2013\u2014-]|$)/i.exec(line);
  if (!m) return null;
  const prefix = /^(?:fig(?:ure)?\.?)/i.test(line) ? 'Figure' : /^scheme/i.test(line) ? 'Scheme' : 'Chart';
  const number = Number(m[1]);
  if (!(number >= 1 && number <= 40)) return null;
  return {kind:prefix==='Figure'&&number===1?'figure1':prefix.toLowerCase(),label:prefix+' '+number,
    caption:line.slice(0,220),number};
}
function graphicalAbstract(line) {
  return /^(?:(?:TOC|table\s+of\s+contents)\s+(?:graphic|image)|graphical\s+abstract)\b/i.test(line || '');
}

export function inspectPdfDoiIdentity(expected, extractedText, metadata) {
  const doi=normalizePdfRescueDoi(expected);
  if (!doi) return 'invalid';
  const meta = typeof metadata==='object' && metadata ? [
    metadata.Subject,metadata.subject,metadata.Keywords,metadata.keywords,metadata.Title,metadata.title
  ].filter(Boolean).join(' ') : '';
  const evidence=(String(extractedText||'')+' '+meta).toLowerCase();
  // Raw PDF.js layout may split a DOI across separate text items; normalize
  // whitespace only for identity recognition, not for displayed caption text.
  const normalized=evidence.replace(/\s+/g,'');
  if(normalized.includes(doi))return 'match';
  const seen=Array.from(normalized.matchAll(DOI_TOKEN),m=>normalizePdfRescueDoi(m[0])).filter(Boolean);
  return seen.length?'mismatch':'unverified';
}

export async function scanPdfFigureRescue(pdf,{doi,limit=PDF_RESCUE_SCAN_LIMIT,onProgress=()=>{}}={}) {
  const target=normalizePdfRescueDoi(doi);
  if (!target) throw new Error('pdf_rescue_invalid_doi');
  if (!pdf || !Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1 || typeof pdf.getPage!=='function') throw new Error('pdf_rescue_invalid_document');
  const pages=Math.min(pdf.numPages,Math.max(1,Math.min(PDF_RESCUE_SCAN_LIMIT,Number(limit)||PDF_RESCUE_SCAN_LIMIT)));
  let metadata=null;
  try{metadata=(await pdf.getMetadata?.())?.info||null;}catch{}
  let firstPagesText='';
  let scannedPages=0;
  const candidates=[];
  const seen=new Set();
  for (let number=1;number<=pages;number++){
    const page=await pdf.getPage(number);
    const content=await page.getTextContent();
    scannedPages=number;
    const lines=textLineGroups(content);
    if(number<=2)firstPagesText+=' '+lines.join(' ');
    for (const line of lines) {
      let info=captionFromLine(line);
      if(!info&&graphicalAbstract(line))info={kind:'graphical-abstract',label:'Graphical Abstract',
        caption:line.slice(0,220),number:0};
      if(!info)continue;
      const key=number+'|'+info.label;
      if(seen.has(key))continue;
      seen.add(key);
      candidates.push({page:number,kind:info.kind,label:info.label,caption:info.caption,
        source:'original_pdf_text_layer',reviewStatus:'needs_manual_crop_and_verification'});
      if(candidates.length>=PDF_RESCUE_MAX_CANDIDATES)break;
    }
    onProgress({scannedPages:number,totalPages:pages,candidates:candidates.length});
    if(candidates.length>=PDF_RESCUE_MAX_CANDIDATES)break;
  }
  const identity=inspectPdfDoiIdentity(target,firstPagesText,metadata);
  return {doi:target,identity,scannedPages,
    totalPages:pdf.numPages,completeScan:scannedPages===pdf.numPages,
    candidates:identity==='mismatch'?[]:candidates,
    publishableAutomatically:false,requiresManualCrop:true,source:'owner_authorized_original_pdf'};
}

export function preparePdfOriginalCropManifest({doi,identity,candidate,crop,canvasWidth,canvasHeight,sha256}) {
  const target=normalizePdfRescueDoi(doi);
  if(!target||!candidate||!Number.isInteger(candidate.page)||candidate.page<1
    ||!['figure1','figure','scheme','chart','graphical-abstract'].includes(candidate.kind))throw new Error('pdf_rescue_invalid_candidate');
  if(!crop||[crop.x,crop.y,crop.width,crop.height].some(v=>!Number.isFinite(v)) ||
    crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>1.0001||crop.y+crop.height>1.0001)throw new Error('pdf_rescue_crop_out_of_bounds');
  if(!Number.isInteger(canvasWidth)||!Number.isInteger(canvasHeight)||canvasWidth<120||canvasHeight<120)throw new Error('pdf_rescue_canvas_invalid');
  if(!/^[a-f0-9]{64}$/.test(String(sha256||'')))throw new Error('pdf_rescue_hash_invalid');
  return {schemaVersion:'owner-pdf-figure-review-v1',doi:target,
    source:'owner_authorized_original_pdf',sourcePage:candidate.page,
    label:candidate.label,kind:candidate.kind,
    captionEvidence:candidate.caption.slice(0,220),
    identity:String(identity||'unverified'),crop,
    rasterPixels:{width:canvasWidth,height:canvasHeight},
    sha256:sha256.toLowerCase(),
    reviewStatus:'requires_scientific_visual_review',
    automaticallyPublishable:false,
    publisherReusePermissionVerified:false,
    sourcePdfBytesExported:false};
}
