import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const SITE_BASE=(process.env.SHARE_SITE_ORIGIN||'https://zhou526316-sys.github.io/organic-synthesis-gallery').replace(/\/+$/,'');
const PUBLIC=path.resolve('public');
const OUT=path.join(PUBLIC,'share');
const DEFAULT_IMAGE=`${SITE_BASE}/share-default.png`;

const normalizeDoi=value=>{
  if(typeof value!=='string') return null;
  const v=value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[?#].*$/,'');
  return /^10\.\d{4,9}\/\S+$/i.test(v)?v:null;
};
const slug=doi=>Buffer.from(doi.toLowerCase(),'utf8').toString('base64url');
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const abs=v=>{try{return typeof v==='string'&&v?new URL(v,`${SITE_BASE}/`).toString():null}catch{return null}};
const official=t=>Boolean(t?.available&&t?.imageUrl&&t?.reason!=='figure1_fallback'&&t?.reason!=='pdf_primary_fallback'&&!String(t?.reason||'').startsWith('figure_fallback:'));
const readJson=async(file,fallback)=>{try{return JSON.parse(await readFile(path.join(PUBLIC,file),'utf8'))}catch{return fallback}};

function doiFrom(record){
  const direct=normalizeDoi(record?.doi); if(direct) return direct;
  if(typeof record?.url!=='string') return null;
  try{
    const u=new URL(record.url);
    if(/^(?:dx\.)?doi\.org$/i.test(u.hostname)) return normalizeDoi(u.pathname.slice(1));
    const m=u.pathname.match(/\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\..+)$/i); if(m) return normalizeDoi(m[1]);
    const n=u.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)$/i);
    if(/nature\.com$/i.test(u.hostname)&&n) return normalizeDoi(`10.1038/${n[1]}`);
  }catch{}
  return null;
}

async function records(){
  const all=[];
  try{
    const enc=(await readFile(path.join(PUBLIC,'papers.gz.b64'),'utf8')).trim();
    const base=JSON.parse(gunzipSync(Buffer.from(enc,'base64')).toString('utf8'));
    if(Array.isArray(base)) all.push(...base);
  }catch{}
  for(const file of ['total-synthesis.json','manual-supplement.json','final-audit-supplement.json','curated-supplement.json','automation-supplement.json','rolling-supplement.json','literature-supplement.json']){
    const p=await readJson(file,{papers:[]}); if(Array.isArray(p?.papers)) all.push(...p.papers);
  }
  return all;
}

function html(meta,media){
  const doi=meta.doi, id=slug(doi);
  const share=`${SITE_BASE}/share/${id}.html`;
  const target=`${SITE_BASE}/?doi=${encodeURIComponent(doi)}`;
  const toc=official(media?.toc)?media.toc:null;
  const image=abs(toc?.imageUrl)||DEFAULT_IMAGE;
  const title=meta.title||doi;
  const secondary=[meta.journal,meta.date,`DOI: ${doi}`].filter(Boolean).join(' · ');
  const description=`${secondary}${secondary?' — ':''}点击进入 Organic Synthesis Gallery，直接定位并高亮这篇文献卡片。`;
  const targetJson=JSON.stringify(target).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Organic Synthesis Gallery</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="Organic Synthesis Gallery"><meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(share)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(share)}"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#172033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.paper{width:min(560px,100%);overflow:hidden;border:1px solid #dfe5ef;border-radius:20px;background:#fff;box-shadow:0 18px 48px rgba(23,32,51,.12)}.cover{display:grid;place-items:center;min-height:260px;padding:18px;background:#f8fafc}.cover img{display:block;width:100%;max-height:360px;object-fit:contain}.body{padding:18px}.site{color:#3159bd;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{margin:8px 0 10px;font-size:20px;line-height:1.42}.meta{color:#667085;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.open{display:inline-flex;margin-top:15px;padding:10px 14px;border-radius:10px;background:#3159bd;color:#fff;text-decoration:none;font-size:13px;font-weight:800}.hint{margin-top:10px;color:#98a2b3;font-size:10px}</style></head><body>
<article class="paper"><div class="cover"><img src="${esc(image)}" alt="${esc(title)}"></div><div class="body"><div class="site">Organic Synthesis Gallery</div><h1>${esc(title)}</h1><div class="meta">${esc(secondary)}</div><a class="open" href="${esc(target)}">进入网页并定位这篇文献 →</a><div class="hint">分享预览封面优先使用官方 TOC；打开后目标卡片会高亮。</div></div></article>
<script>(()=>{const t=${targetJson};setTimeout(()=>location.replace(t),80)})()</script></body></html>`;
}

const merged=new Map();
for(const r of await records()){
  const doi=doiFrom(r); if(!doi) continue;
  const old=merged.get(doi)||{doi,title:'',journal:'',date:''};
  const title=typeof r?.title==='string'?r.title.trim():'';
  const journal=typeof r?.journal==='string'?r.journal.trim():'';
  const date=typeof r?.date==='string'?r.date.trim():'';
  if(title&&(!old.title||title.length>old.title.length)) old.title=title;
  if(journal&&!old.journal) old.journal=journal;
  if(date&&(!old.date||date>old.date)) old.date=date;
  merged.set(doi,old);
}
const media=await readJson('media-index.json',{items:{}});
await rm(OUT,{recursive:true,force:true}); await mkdir(OUT,{recursive:true});
let tocCoverCount=0;
for(const [doi,meta] of merged){
  const item=media?.items?.[doi]||media?.items?.[doi.toLowerCase()]||null;
  if(official(item?.toc)) tocCoverCount++;
  await writeFile(path.join(OUT,`${slug(doi)}.html`),html(meta,item),'utf8');
}
console.log('SHARE_PAGES_SUMMARY '+JSON.stringify({pages:merged.size,tocCoverCount,fallbackCoverCount:merged.size-tocCoverCount,siteBase:SITE_BASE}));
