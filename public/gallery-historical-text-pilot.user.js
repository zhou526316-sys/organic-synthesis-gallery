// ==UserScript==
// @name         Gallery Historical Text Search — Local Pilot
// @namespace    https://gallery.gczhouwld.com/
// @version      0.2.10
// @description  One-click independent historical text batch; DOI/license gated local search, no TOC/figures/PDF writes.
// @author       Organic Synthesis Gallery
// @match        https://gallery.gczhouwld.com/*
// @match        https://pubs.acs.org/*
// @match        https://onlinelibrary.wiley.com/*
// @match        https://*.onlinelibrary.wiley.com/*
// @match        https://pubs.rsc.org/*
// @match        https://www.nature.com/*
// @match        https://www.science.org/*
// @match        https://www.sciencedirect.com/*
// @match        https://*.sciencedirect.com/*
// @match        https://www.cell.com/*
// @match        https://*.cell.com/*
// @match        https://www.chinesechemsoc.org/*
// @match        https://chinesechemsoc.org/*
// @match        https://www.ccspublishing.org.cn/*
// @match        https://*.ccspublishing.org.cn/*
// @run-at       document-start
// @noframes
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      gallery.gczhouwld.com
// @connect      api.gczhouwld.com
// @connect      www.ebi.ac.uk
// @connect      doi.org
// @updateURL    https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// @downloadURL  https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// ==/UserScript==

(() => {
  'use strict';
  const BATCH_TAB_BIND_KEY='gallery-historical-text-batch-v2:tab-binding-v030';
  // TOC-inspired early binding survives publisher SPA hash cleanup.
  try{
    const early=/^#gallery-historical-job=([a-f0-9]{24})$/.exec(location.hash||'');
    if(early&&publisher(location.hostname)&&typeof sessionStorage!=='undefined')
      sessionStorage.setItem(BATCH_TAB_BIND_KEY,early[1]);
  }catch(_){}
  const CUTOFF='2026-10-01';
  const CATALOG_URL='https://gallery.gczhouwld.com/toc-demand-live.json'; // Complete 1-shot TOC-aligned DOI registry
  const CANONICAL_RELEASE_URL='https://gallery.gczhouwld.com/release-delivery.json';
  const SOURCE_RESULT_MAX_BYTES=5000000;
  const SCHEMA='gallery-historical-local-text-pilot-v1';
  const DOI=/^10\.\d{4,9}\/\S+$/;
  const EXCLUDE_HEADING=/^(?:references?|bibliography|acknowledg(?:e)?ments?|author information|author contributions?|author notes?|corresponding author|associated content|supplementary information|supporting information|funding|conflicts? of interest|competing interests?|data availability|code availability|additional information|rights and permissions|licen[cs](?:e|ing)?|open access|about this article|peer review (?:file|information)|reprints?|ethics (?:declarations?|approval)|publisher(?:'s)? note|article information)\b/i;
  const EXCLUDE_CONTEXT=/(?:^|[\s_-])(?:reference|bibliography|related|recommended|navigation|share|cookie|social|advert|footer)(?:$|[\s_-])/i;
  const KNOWN_HOSTS={
    'pubs.acs.org': 'acs',
    'onlinelibrary.wiley.com': 'wiley',
    'pubs.rsc.org': 'rsc',
    'www.nature.com': 'nature',
    'www.science.org': 'science',
    'www.sciencedirect.com': 'elsevier',
    'www.cell.com': 'elsevier',
    'www.chinesechemsoc.org': 'ccs',
    'chinesechemsoc.org': 'ccs',
    'www.ccspublishing.org.cn': 'ccs',
  };
  function publisher(hostname){
    for(const [host,kind] of Object.entries(KNOWN_HOSTS))
      if(hostname===host||(hostname.endsWith('.'+host)&&!host.startsWith('www.')))return kind;
    return '';
  }
  function normalizeDoi(value){
    const doi=String(value||'').trim().toLowerCase().replace(/^doi:\s*/,'')
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/[).,;]+$/,'');
    return DOI.test(doi)?doi:'';
  }
  function cleanText(value,limit=30000){
    return String(value||'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ')
      .replace(/\n{3,}/g,'\n\n').trim().slice(0,limit);
  }
  function pageDoi(){
    const tags=document.querySelectorAll(
      'meta[name="citation_doi" i],meta[name="dc.identifier" i],meta[name="prism.doi" i],meta[property="citation_doi" i]'
    );
    const found=[...tags].map(x=>normalizeDoi(x.content)).filter(Boolean);
    const unique=[...new Set(found)];
    // No URL-suffix or title guessing, and no ambiguous DOI.
    return unique.length===1?unique[0]:'';
  }
  function batchPathBindsCurrentJob(job){
    // Only diagnose whether THIS publisher article route was reached. URL
    // resemblance never substitutes for DOI metadata, license or text rights.
    if(!job?.doi||!publisher(location.hostname))return false;
    let path;try{path=decodeURIComponent(location.pathname).toLowerCase();}catch(_){return false;}
    const doi=String(job.doi).toLowerCase();
    const articleMarker='/doi/'+doi;
    const pos=path.indexOf(articleMarker);
    if(pos>=0&&(pos+articleMarker.length===path.length
      ||path[pos+articleMarker.length]==='/'))return true;
    if(doi.startsWith('10.1038/')){
      const suffix=doi.split('/').slice(1).join('/');
      return path==='/articles/'+suffix;
    }
    return false;
  }
  function excluded(node, includeMedia=false){
    if(node.closest('nav,aside,footer,form,[role="navigation"],[aria-hidden="true"]'))return true;
    if(!includeMedia&&node.closest('figure,table'))return true;
    for(let current=node;current&&current!==document.body;current=current.parentElement){
      if(EXCLUDE_CONTEXT.test(String(current.id||'')+' '+String(current.className||'')))return true;
    }
    return false;
  }

  // For DOI-verified pages without reuse permission, report structural counts
  // only. No text is persisted or sent to the server.
  // Reuse the TOC mainline's publisher body container selection strategy
  // rather than treating the first <main> (which can be a page shell) as text.
  function batchArticleRoot(){
    const selectors=['.article__body','.article-body','.article_content',
      '.article__content','.article-content','.bodymatter','.c-article-body',
      '#articleBody','#pnlArticleContent','.Body','#body','main article',
      'article','[role="main"]','main'];
    let best=null,score=-1;
    const seen=new Set();
    for(const selector of selectors){
      let nodes=[];
      try{nodes=Array.from(document.querySelectorAll(selector));}catch(_){}
      for(const node of nodes){
        if(!node||seen.has(node)||!node.querySelectorAll)continue;
        seen.add(node);
        let evidence;
        try{evidence=batchBodyStructure(node);}catch(_){continue;}
        const textSize=Math.min(200000,String(node.textContent||'').length);
        const rank=evidence.scienceChars*3+evidence.sectionCount*250
          +Math.min(3000,evidence.abstractChars)+textSize/20;
        if(rank>score){best=node;score=rank;}
      }
    }
    return best||document.querySelector('main article, article, main, [role="main"]');
  }
  function batchBodyStructure(root){
    if(!root)return {presence:'page_shell',scienceChars:0,
      abstractChars:0,sectionCount:0,headingCount:0,captionCount:0,tableCount:0};
    let scienceChars=0,abstractChars=0,otherChars=0,heading='',
      headingCount=0,sectionCount=0;
    const science=/results?|discuss|scope|mechanis|control|reaction development|synthes|synthetic applications?|optimization|experimental|methods|procedures?/i;
    for(const node of root.querySelectorAll('h2,h3,h4,p')){
      if(excluded(node))continue;
      const val=cleanText(node.textContent,6000);
      if(/^H[234]$/.test(node.tagName)){
        heading=val.slice(0,160);headingCount++;
        if(science.test(heading))sectionCount++;
        continue;
      }
      if(val.length<45)continue;
      if(science.test(heading))scienceChars+=val.length;
      else if(/^abstract\b/i.test(heading))abstractChars+=val.length;
      else otherChars+=val.length;
    }
    const captionCount=Math.min(200,root.querySelectorAll('figure figcaption, figure .caption').length);
    const tableCount=Math.min(80,root.querySelectorAll('table').length);
    const presence=scienceChars>=250?'scientific_sections':
      abstractChars>=45?'abstract_only':
      scienceChars>0||otherChars>=250?'partial_science':'page_shell';
    return {presence,scienceChars:Math.min(scienceChars,400000),
      abstractChars:Math.min(abstractChars,400000),
      sectionCount:Math.min(sectionCount,300),headingCount:Math.min(headingCount,300),
      captionCount,tableCount};
  }
  function batchReuseRights(root){
    const license=batchLicenseEvidence(root);
    if(license)return {signal:'cc_reuse_verified',license};
    const candidates=document.querySelectorAll(
      'meta[name="citation_license_url" i],link[rel="license" i],meta[property="article:license" i]');
    const declared=Array.from(candidates).some(el=>{
      const url=String(el.content||el.href||el.getAttribute('href')||'');
      return /^https?:\/\//i.test(url)
        &&!/creativecommons\.org\/(?:licenses\/by\/(?:3\.0|4\.0)|publicdomain\/zero\/1\.0)/i.test(url);
    });
    // A non-CC rights notice is evidenced only inside the exact current
    // article, not by page footer, recommended papers or OA badges.
    const explicitNotice=Array.from(root?.querySelectorAll('section')||[]).some(section=>{
      if(typeof section.closest==='function'&&excluded(section,true))return false;
      const title=cleanText(section.querySelector('h2,h3,h4')?.textContent||'',120);
      if(!/^(?:rights and permissions|licen[cs](?:e|ing)?|copyright)\b/i.test(title))return false;
      const body=cleanText(section.textContent,7000);
      return body.length>=50&&/\b(?:all rights reserved|licensed under|copyright|licen[cs](?:e|ed))\b/i.test(body);
    });
    return {signal:declared||explicitNotice?'other_license_declared':'unverified',license:null};
  }
  function batchBodyCompleteness(capture){
    const sections=(capture?.sections||[]).filter(s=>s.type!=='abstract');
    const scientific=sections.filter(s=>['results','scope','optimization','mechanism','experimental'].includes(s.type));
    const scienceChars=scientific.reduce((n,s)=>n+String(s.text||'').length,0);
    const hasResults=sections.some(s=>['results','scope','optimization'].includes(s.type));
    const hasConclusion=sections.some(s=>s.type==='conclusion');
    const completeness=scienceChars<250
      ?((capture?.sections||[]).some(s=>s.type==='abstract')?'abstract_only':'unavailable')
      :hasResults&&hasConclusion&&scienceChars>=2500&&sections.length>=3
        ?'complete_candidate':'partial';
    return {scienceChars,scienceSectionCount:scientific.length,
      sectionCount:sections.length,captionCount:(capture?.captions||[]).length,
      tableCount:(capture?.tables||[]).length,hasResults,hasConclusion,
      completeness};
  }
  function gather(){
    const root=batchArticleRoot();
    if(!root)throw Error('找不到可验证的文章正文容器');
    const sections=[], group=new Map();
    let heading='Article body', isReferences=false, consumed=0, paragraphCount=0;
    for(const node of root.querySelectorAll('h2,h3,h4,p')){
      if(excluded(node))continue;
      if(/^H[234]$/.test(node.tagName)){
        heading=cleanText(node.textContent,300)||'Article body';
        isReferences=EXCLUDE_HEADING.test(heading);
        continue;
      }
      if(isReferences)continue;
      const value=cleanText(node.textContent,6000);
      if(value.length<45)continue;
      if(consumed+value.length>240000||paragraphCount>=350)break;
      consumed+=value.length;paragraphCount++;
      const key=heading.toLowerCase();
      if(!group.has(key)){
        const row={type:/^abstract\b/i.test(heading)?'abstract':/mechanis|control experiments?|catalytic cycle/i.test(heading)?'mechanism':/result|scope|discussion|screening|optimization|structure.reactivity|synthes|synthetic applications?|substrate|reaction development/i.test(heading)?'results':/experimental|methods|materials and methods|procedure/i.test(heading)?'experimental':/introduct|background/i.test(heading)?'introduction':/conclusion|outlook|summary/i.test(heading)?'conclusion':'other',
          heading,text:'',order:sections.length};
        group.set(key,row);sections.push(row);
      }
      const row=group.get(key);
      if(row.text.length+value.length<=30000)row.text+=(row.text?'\n\n':'')+value;
    }
    // The TOC evidence engine uses heading ranges to include scientific
    // lists and nested blocks omitted by a p-only extractor. Prefer a longer
    // DOM-bound section without altering its scientific heading or rights gate.
    try{
      if(typeof document.createRange==='function'){
        const headings=Array.from(root.querySelectorAll('h2,h3,h4'));
        for(let i=0;i<headings.length;i++){
          const node=headings[i],name=cleanText(node.textContent,300);
          const row=group.get(name.toLowerCase());
          if(!row||row.type==='abstract'||EXCLUDE_HEADING.test(name)||excluded(node))continue;
          const range=document.createRange();
          range.setStartAfter(node);
          if(headings[i+1])range.setEndBefore(headings[i+1]);
          else if(root.lastChild)range.setEndAfter(root.lastChild);
          else continue;
          const holder=document.createElement('div');
          holder.appendChild(range.cloneContents());
          holder.querySelectorAll('script,style,noscript,nav,aside,footer,[aria-hidden="true"]')
            .forEach(el=>el.remove());
          const expanded=cleanText(holder.textContent,30000);
          if(expanded.length>row.text.length+80)row.text=expanded;
        }
      }
    }catch(_){ /* P/h2 section extraction remains valid. */ }
    const captions=[];
    for(const node of root.querySelectorAll('figure figcaption, figure .caption')){
      if(excluded(node,true))continue;
      const text=cleanText(node.textContent,6000);
      if(text.length>20&&captions.length<70&&!captions.some(x=>x.text===text)){
        const m=text.match(/^(Scheme|Figure|Fig\.?|Equation)\s*[0-9A-Za-z().-]*/i);
        captions.push({label:m?m[0]:'Figure',text});
      }
    }
    const tables=[];
    for(const node of root.querySelectorAll('table')){
      if(excluded(node,true))continue;
      const text=cleanText(node.textContent,9000);
      if(text.length>=30&&tables.length<30)tables.push({label:'Table '+String(tables.length+1),text});
    }
    if(sections.length===0||consumed<250)throw Error('只有页面壳或正文内容不足，不保存为全文');
    const packet={sections,captions,tables,paragraphCount,characterCount:consumed};
    return {...packet,coverage:batchBodyCompleteness(packet)};
  }
  function loadCatalog(){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url:CATALOG_URL,timeout:16000,
        onload(response){
          try{
            if(response.status!==200||String(response.responseText||'').length>4000000)
              throw Error('正式文献目录无法读取');
            const result=JSON.parse(String(response.responseText||''));
            if(!Array.isArray(result.articles)||!result.pairedCaptureRegistry)
              throw Error('正式文献目录格式错误');
            resolve(result);
          }catch(error){reject(error);}
        },
        onerror(){reject(Error('目录网络访问失败'));},
        ontimeout(){reject(Error('目录请求超时'));}
      });
    });
  }
  function approvedHistorical(catalog, doi){
    const rows=(catalog.articles||[]).filter(x=>normalizeDoi(x.doi)===doi);
    if(rows.length!==1)throw Error('当前正式目录中 DOI 不唯一或未批准收录');
    const row=rows[0], date=String(row.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=CUTOFF)
      throw Error('不是已验证的 2026-10-01 前历史文献');
    return {publication:date,journal:String(row.journal||'').slice(0,140),
      title:String(row.title||'').slice(0,1000),mediaPolicy:String(row.mediaPolicy||'')};
  }
  async function sha256(value){
    const bytes=new TextEncoder().encode(value);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  function saveLocal(packet){
    const blob=new Blob([JSON.stringify(packet,null,2)+'\n'],{type:'application/json'});
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=href;a.download='gallery-historical-'+packet.doi.replace(/[^a-z0-9.-]+/gi,'_')+'.json';
    a.style.display='none';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),30000);
  }
  async function exportCurrent(){
    try{
      if(!publisher(location.hostname))throw Error('当前域名不是已配置的出版社');
      const doi=pageDoi();
      if(!doi)throw Error('缺少唯一的出版社 DOI 元数据，不猜测论文身份');
      if(!window.confirm('仅在出版商或开放许可允许您对当前文章进行本地文本提取时继续。仅保存到本机，不上传 Gallery，不下载 PDF、正文图或 SI。确认继续？'))return;
      const catalog=await loadCatalog();
      const approved=approvedHistorical(catalog,doi);
      const data=gather();
      const canonical=[...data.sections.map(x=>x.heading+'\n'+x.text),
        ...data.captions.map(x=>x.label+'\n'+x.text),
        ...data.tables.map(x=>x.label+'\n'+x.text)].join('\n');
      const packet={schemaVersion:SCHEMA,doi,
        publication:approved.publication,journal:approved.journal,title:approved.title,
        publisher:publisher(location.hostname),mediaPolicy:approved.mediaPolicy,
        sourceUrl:location.origin+location.pathname,
        capturedAt:new Date().toISOString(),sourceSha256:await sha256(canonical),
        rightsStatus:'local_only_permission_to_be_verified',
        indexEligibility:'local_pilot_only',publicUploadAllowed:false,
        pdfDownloaded:false,mediaDownloaded:false,
        paragraphs:data.paragraphCount,characters:data.characterCount,
        sections:data.sections,captions:data.captions,tables:data.tables};
      saveLocal(packet);
      window.alert('已生成本地正文文本包：'+doi+'。尚未上传或加入 Gallery 公共全文检索。');
    }catch(error){window.alert('Gallery 历史正文试验：'+String(error?.message||error).slice(0,170));}
  }

  // Isolated batch protocol. Never share storage keys, leases, queue writes or
  // controller lifecycle with the production TOC/figure/private-PDF scripts.
  const BATCH_SCRIPT_VERSION='0.2.10';
  // Bump only when rights/body extraction gains new evidence: old uncertain DOI get ONE fresh check.
  const BATCH_CAPTURE_REVISION='historic-body-evidence-v030';
  const BATCH_PREFIX='gallery-historical-text-batch-v2:';
  const BATCH_STATE=BATCH_PREFIX+'state';
  const BATCH_JOB=BATCH_PREFIX+'job';
  const BATCH_RESULT=BATCH_PREFIX+'result';
  const BATCH_LEASE=BATCH_PREFIX+'lease';
  const BATCH_DB='gallery-historical-text-local-v2';
  const BATCH_OA_SOURCE_REVISION='europepmc-oa-science-v030';
  const BATCH_OA_ENDPOINT='https://www.ebi.ac.uk/europepmc/webservices/rest/';
  const BATCH_OA_MAX_XML_CHARS=2600000;
  const BATCH_OA_MIN_GAP_MS=650;
  const BATCH_REPORT_ENDPOINT='https://api.gczhouwld.com/api/admin/historical-text/reports';
  const BATCH_DIAG_PREFIX=BATCH_PREFIX+'diagnostics-outbox-v1:';
  const BATCH_DIAG_TOKEN=BATCH_PREFIX+'diagnostics-owner-token';
  const BATCH_DIAG_ACK=BATCH_PREFIX+'diagnostics-acks-v1';
  const BATCH_DIAG_STATE=BATCH_PREFIX+'diagnostics-state-v1';
  const BATCH_PROGRESS=BATCH_PREFIX+'publisher-progress-v1';
  const BATCH_DIAG_MAX_PENDING=1500;
  const BATCH_DIAG_SCHEMA='historical-text-diagnostic-v1';
  const BATCH_LIMIT_MS=24000;
  // Fast successes exit on real DOM evidence; only unresolved pages use this budget.
  const BATCH_PUBLISHER_PROBE_MS=9500;
  const BATCH_MAX_REVIEW_TABS=2;
  const BATCH_NO_HANDLER_PILOT_MS=10000; // Also detect uninitialized normal publisher tabs.
  const BATCH_LEASE_MS=40000;
  const BATCH_RETRY_MS=0; // No blanket 24h lockout; reason-dependent rechecking below.
  const BATCH_MAX_RESPONSE_CHARS=350000;
  const BATCH_MIN_GAP_MS=2000;
  const BATCH_DOI_LIMIT=100000;
  // Keep final-result classification aligned with Worker diagnostic reason enums.
  // A genuine publisher 403/429 must not become 'invalid_response'.
  const BATCH_ERRORS=new Set(['doi_unverified','publisher_unreachable','page_unavailable',
    'page_access_blocked','page_http_error','publisher_no_response',
    'publisher_script_not_confirmed','license_not_verified','license_pending_load','body_missing','too_large',
    'timeout','invalid_response','storage_failure','local_storage_failed',
    'response_hash_mismatch','capture_failed','unsupported_publisher']);
  let batchActive=false,batchPaused=false,batchTab=null,batchStatus=null,batchRunId='',batchUi=null;
  const batchReviewTabs=[];
  let batchDiagBusy=false,batchDiagStarted=false;
  const batchWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function batchId(){
    const bytes=new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  // Prefer the same-origin browser path used by TOC for large, complete
  // manifests; keep Tampermonkey as a bounded fallback for transient transport
  // failures. A malformed or non-200 manifest is not silently accepted.
  async function batchFetchJson(url){
    const validate=response=>{
      if(!response||typeof response!=='object'||Array.isArray(response))
        throw Error('正式文献清单数据格式错误');
      return response;
    };
    if(typeof fetch==='function'&&new URL(url).origin===location.origin){
      let timer=null;
      try{
        const abort=new AbortController();
        timer=setTimeout(()=>abort.abort(),10000);
        const response=await fetch(url,{method:'GET',cache:'no-store',
          credentials:'omit',headers:{accept:'application/json'},signal:abort.signal});
        if(!response.ok)throw Error('正式清单 HTTP '+response.status);
        const raw=await response.text();
        if(raw.length>SOURCE_RESULT_MAX_BYTES)throw Error('正式清单超过容量保护');
        return validate(JSON.parse(raw));
      }catch(error){
        const message=String(error?.message||'');
        if(/正式清单 HTTP |正式清单超过容量保护/.test(message))
          throw error; // HTTP denial or excessive payload is not a retry hint.
      }finally{if(timer!==null)clearTimeout(timer);}
    }
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:16000,headers:{accept:'application/json'},
        onload(response){
          try{
            const raw=String(response.responseText||'');
            if(response.status!==200)throw Error('正式清单 HTTP '+String(response.status));
            if(raw.length>SOURCE_RESULT_MAX_BYTES)throw Error('正式清单超过容量保护');
            resolve(validate(JSON.parse(raw)));
          }catch(error){reject(error);}
        },
        onerror(){reject(Error('正式清单浏览器及扩展传输失败'));},
        ontimeout(){reject(Error('正式清单扩展网络请求超时'))}
      });
    });
  }
  async function batchLoadCanonicalCatalog(includeAllFormal=false){
    // The complete DOI registry already exists in one TOC-mainline manifest.
    // Never page through /api/literature/catalog-view as a startup prerequisite.
    // This is NOT the smaller "missing TOC" media subqueue.
    const [release,queue]=await Promise.all([
      batchFetchJson(CANONICAL_RELEASE_URL),
      batchFetchJson(CATALOG_URL)
    ]);
    const catalogId=String(release.architectureCatalogId||'');
    if(!/^[0-9a-f]{64}$/.test(catalogId)
      ||!Array.isArray(release.dois)
      ||!Number.isSafeInteger(release.productionCards)
      ||release.dois.length!==release.productionCards
      ||release.dois.length>BATCH_DOI_LIMIT)
      throw Error('正式 Pages 文献目录版本不可信');
    if(queue.pairedCaptureRegistry!==true||!Array.isArray(queue.articles)
      ||queue.articles.length!==Number(queue.webpageDoiCount)
      ||queue.articles.length!==release.dois.length
      ||queue.articles.length>BATCH_DOI_LIMIT)
      throw Error('TOC 完整 DOI 清单与正式发布清单数量不一致');
    const members=new Set();
    for(const raw of release.dois){
      const doi=normalizeDoi(raw);
      if(!doi||members.has(doi))throw Error('正式 DOI 发布清单重复或无效');
      members.add(doi);
    }
    const articles=[],seen=new Set();
    for(const row of queue.articles){
      const doi=normalizeDoi(row?.doi);
      const date=String(row?.date||'');
      if(!doi||!members.has(doi)||seen.has(doi)
        ||(date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(date))
        ||!String(row?.journal||'').trim())
        throw Error('TOC 清单包含未发布、重复 DOI 或无效文献元数据');
      seen.add(doi);
      if(includeAllFormal||(date&&date<CUTOFF))
        articles.push({doi,date,title:String(row.title||'').slice(0,1000),
          journal:String(row.journal||'').slice(0,140),
          // Local OA retry generation only; NOT a verified article revision
          // for the independent public FTS import process.
          revision:catalogId});
    }
    if(seen.size!==members.size)throw Error('TOC 完整 DOI 集合与正式发布集合不一致');
    return {pairedCaptureRegistry:true,webpageDoiCount:articles.length,
      formalCount:members.size,publishedCatalogId:catalogId,articles,
      registrySource:'complete_toc_manifest',registryGeneratedAt:String(queue.generatedAt||'')};
  }

  // Opt-in OPEN SCIENCE supplement: entire formal DOI list, NOT just old-date
  // media queues. Only article-scoped CC BY/CC0 OA JATS can enter local IDB.
  // Does not open publisher tabs, copy cookies, request PDFs/SI/images,
  // modify the production media controller, or call public FTS import.
  function batchOfficialOaGet(path,xml=false){
    if(!/^\/(?:search\?|PMC\d{4,12}\/fullTextXML$)/.test(path))
      return Promise.reject(Error('oa_source_path_invalid'));
    return new Promise((resolve,reject)=>{
      const url=BATCH_OA_ENDPOINT.replace(/\/$/,'')+path;
      GM_xmlhttpRequest({method:'GET',url,timeout:16000,
        headers:{accept:xml?'application/xml':'application/json'},
        onload(response){
          try{
            if(response.finalUrl&&new URL(response.finalUrl).hostname!=='www.ebi.ac.uk')
              throw Error('oa_source_redirect_untrusted');
            const status=Number(response.status);
            if(status===429)throw Error('source_rate_limited');
            if(status===404)throw Error('source_not_found');
            if(status!==200)throw Error('source_http_'+status);
            const raw=String(response.responseText||'');
            if(raw.length>(xml?BATCH_OA_MAX_XML_CHARS:800000))
              throw Error('oa_source_too_large');
            if(!raw)throw Error('oa_source_empty');
            resolve(raw);
          }catch(error){reject(error);}
        },
        ontimeout(){reject(Error('oa_source_timeout'));},
        onerror(){reject(Error('oa_source_unavailable'))}
      });
    });
  }
  function batchOaDirectParagraphs(node){
    const out=[],ignored=new Set(['sec','fig','table-wrap','ref-list','supplementary-material',
      'permissions','ack','fn-group','app-group','boxed-text','disp-formula','list']);
    const walk=parent=>{
      for(const child of parent.children||[]){
        const tag=String(child.localName||child.tagName||'').toLowerCase();
        if(ignored.has(tag))continue;
        if(tag==='p'){
          const value=cleanText(child.textContent,18000);
          if(value.length>=15)out.push(value);
        }else walk(child);
      }
    };
    walk(node);return out;
  }
  function batchOaScientificType(heading){
    return /mechanis|kinetic|control experiment|spectroscop/i.test(heading)?'mechanism':
      /result|discuss|scope|substrate|synthes|synthetic|optimization|screening/i.test(heading)?'results':
      /experimental|methods|procedur/i.test(heading)?'experimental':
      /conclusion|outlook|summary/i.test(heading)?'conclusion':
      /introduct|background/i.test(heading)?'introduction':'other';
  }
  async function batchParseOfficialOa(xml,paper,pmcid){
    if(typeof DOMParser!=='function'||typeof XMLSerializer!=='function')
      throw Error('oa_xml_parser_unavailable');
    const parsed=new DOMParser().parseFromString(xml,'application/xml');
    if(parsed.getElementsByTagName('parsererror').length)
      throw Error('oa_xml_parse_failed');
    const meta=parsed.getElementsByTagName('article-meta')[0];
    const doiNodes=meta?[...meta.getElementsByTagName('article-id')]:[];
    const ids=[...new Set(doiNodes.filter(x=>x.getAttribute('pub-id-type')==='doi')
      .map(x=>normalizeDoi(x.textContent)).filter(Boolean))];
    if(ids.length!==1||ids[0]!==paper.doi)
      throw Error('oa_xml_doi_mismatch');
    const licenses=meta?[...meta.getElementsByTagName('license')]:[];
    if(!licenses.length)throw Error('oa_license_unknown');
    const serialized=licenses.map(x=>new XMLSerializer().serializeToString(x)).join('\n');
    if(/by-nc|by-nd|noncommercial|no.?derivatives|all rights reserved/i.test(serialized))
      throw Error('oa_license_restricted');
    const rawMatches=[...serialized.matchAll(/https?:\/\/creativecommons\.org\/(licenses\/by\/(?:3\.0|4\.0)|publicdomain\/zero\/1\.0)\/?/gi)];
    const paths=[...new Set(rawMatches.map(x=>x[1].toLowerCase()))];
    if(paths.length!==1)throw Error('oa_license_unknown');
    const licenseUrl='https://creativecommons.org/'+paths[0]+'/';
    const body=parsed.getElementsByTagName('body')[0];
    if(!body)throw Error('oa_science_missing');
    const blocks=[],top=batchOaDirectParagraphs(body);
    if(top.length)blocks.push({heading:'Main article introduction',texts:top});
    for(const section of body.getElementsByTagName('sec')){
      const title=[...section.children].find(x=>x.localName==='title');
      const heading=cleanText(title?.textContent||'Unheaded scientific section',200);
      if(EXCLUDE_HEADING.test(heading))continue;
      const texts=batchOaDirectParagraphs(section);
      if(texts.length)blocks.push({heading,texts});
    }
    const sections=[],captions=[],tables=[];
    let chars=0,paragraphs=0;
    for(const block of blocks){
      let text='',part=1;
      const put=()=>{
        if(!text)return;
        sections.push({type:batchOaScientificType(block.heading),
          heading:block.heading+(part>1?' (part '+part+')':''),text,order:sections.length});
        part++;text='';
      };
      for(const p of block.texts){
        if(p.length>16000)throw Error('oa_science_section_oversize');
        chars+=p.length;paragraphs++;
        if(chars>240000||paragraphs>2000)throw Error('oa_science_too_large');
        if(text&&text.length+2+p.length>16000)put();
        text+=(text?'\n\n':'')+p;
      }
      put();
      if(sections.length>160)throw Error('oa_science_too_large');
    }
    if(paragraphs<2||chars<450||!sections.length)
      throw Error('oa_science_missing');
    for(const el of [...body.getElementsByTagName('fig')]){
      const cap=[...el.children].find(x=>x.localName==='caption');
      const value=cleanText(cap?.textContent||'',6000);
      if(value.length>=20&&captions.length<100)
        captions.push({label:String(el.getAttribute('id')||'Figure').slice(0,70),text:value});
    }
    for(const el of [...body.getElementsByTagName('table-wrap')]){
      const caption=[...el.children].find(x=>x.localName==='caption');
      const table=[...el.children].find(x=>x.localName==='table');
      const value=cleanText([caption?.textContent,table?.textContent].filter(Boolean).join(' '),9000);
      if(value.length>=30&&tables.length<60)
        tables.push({label:String(el.getAttribute('id')||'Table').slice(0,70),text:value});
    }
    const canonical=[...sections.map(x=>x.heading+'\n'+x.text),
      ...captions.map(x=>x.label+'\n'+x.text),
      ...tables.map(x=>x.label+'\n'+x.text)].join('\n');
    const packet={schemaVersion:SCHEMA,doi:paper.doi,
      publication:paper.date||'',journal:paper.journal,title:paper.title,
      sourceUrl:BATCH_OA_ENDPOINT+pmcid+'/fullTextXML',
      publisher:'europe_pmc_oa',sourceKind:'official_oa_jats',
      sourceXmlSha256:await sha256(xml),sourceSha256:await sha256(canonical),
      capturedAt:new Date().toISOString(),
      rightsStatus:'local_only_permission_to_be_verified',
      rightsBasis:paths[0],licenseUrl,
      indexEligibility:'local_pilot_only',publicUploadAllowed:false,
      pdfDownloaded:false,mediaDownloaded:false,siDownloaded:false,
      paragraphs,characters:chars,sections,captions,tables,
      bodyCompleteness:'partial',
      completenessNote:'Open JATS science captured; publisher figures/SI and exact completeness not independently audited'};
    if(JSON.stringify(packet).length>BATCH_MAX_RESPONSE_CHARS)
      throw Error('oa_science_too_large');
    return packet;
  }
  async function batchFetchOfficialOaPacket(paper){
    const query='/search?'+new URLSearchParams({
      query:'DOI:'+paper.doi,format:'json',resultType:'core',pageSize:'3'}).toString();
    const metadata=JSON.parse(await batchOfficialOaGet(query));
    const matches=(metadata?.resultList?.result||[])
      .filter(row=>normalizeDoi(row.doi)===paper.doi);
    if(matches.length!==1)throw Error('oa_metadata_doi_missing');
    const entry=matches[0],pmcid=String(entry.pmcid||'');
    if(entry.isOpenAccess!=='Y'||!/^PMC\d{4,12}$/.test(pmcid))
      throw Error('oa_pmc_missing');
    const xml=await batchOfficialOaGet('/'+pmcid+'/fullTextXML',true);
    return batchParseOfficialOa(xml,paper,pmcid);
  }
  async function batchStartOfficialOa(){
    if(batchActive)return;
    batchStatusWrite({state:'loading',source:'europe_pmc_oa',total:0,attempted:0,
      currentStage:'一次读取正式全库 DOI 清单',lastError:''});
    const locked=GM_getValue(BATCH_LEASE,null);
    if(locked&&locked.until>Date.now())
      throw Error('独立正文补抓已有任务在本浏览器运行');
    const catalog=await batchLoadCanonicalCatalog(true);
    if(catalog.articles.length!==catalog.formalCount)
      throw Error('OA扫描正式目录未覆盖全部DOI');
    const db=await batchOpenDb();
    let selected=[],previousCount=0;
    try{
      const saved=new Set(await batchDbOp(db,'packets','getAllKeys'));
      const previous=new Map((await batchDbOp(db,'oaAttempts','getAll'))
        .map(x=>[x.doi,x]));
      previousCount=saved.size;
      const stable=new Set(['oa_metadata_doi_missing','oa_pmc_missing',
        'oa_license_restricted','oa_license_unknown','oa_science_missing',
        'oa_science_too_large','oa_science_section_oversize','oa_xml_doi_mismatch']);
      selected=catalog.articles.filter(row=>{
        if(saved.has(row.doi))return false;
        const prior=previous.get(row.doi);
        return !(prior?.revision===row.revision
          &&prior?.sourceRevision===BATCH_OA_SOURCE_REVISION
          &&stable.has(prior.status));
      });
    }catch(e){db.close();throw e;}
    if(!selected.length){
      db.close();batchStatusWrite({state:'finished',source:'europe_pmc_oa',
        total:0,attempted:0,saved:0,existing:previousCount,failed:0,
        currentStage:'没有需要从官方OA来源重试的DOI'});
      return;
    }
    if(!window.confirm('全正式文献目录 '+catalog.formalCount+' 篇；本轮将核验 '+selected.length+
      ' 篇的官方开放许可/科学正文？\n只能保存经过文章级 CC BY/CC0 和 DOI 双重验证的正文至当前浏览器；'
      +'不下载图片、PDF或SI，不上传至公共服务器，关闭浏览器后本机可继续。')){
      db.close();return;
    }
    const next=GM_getValue(BATCH_LEASE,null);
    if(next&&next.until>Date.now()){db.close();throw Error('本机已有独立正文任务占用租约');}
    const runId=batchId();
    batchActive=true;batchPaused=false;batchRunId=runId;
    let attempted=0,saved=0,rightsPending=0,failed=0,rateLimited=false;
    const leaseTimer=setInterval(()=>{
      if(batchActive)GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    },4000);
    GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    batchStatusWrite({state:'running',source:'europe_pmc_oa',runId,
      total:selected.length,attempted:0,saved:0,failed:0,
      rightsPending:0,existing:previousCount,lastError:'',
      currentStage:'official_oa_source',startedAt:Date.now()});
    try{
      for(const row of selected){
        if(batchPaused)break;
        let status='oa_source_unavailable',packet=null;
        batchStatusWrite({lastDoi:row.doi,currentStage:'Europe PMC 正式 DOI 探测'});
        try{
          packet=await batchFetchOfficialOaPacket(row);
          const canonical=[...packet.sections.map(x=>x.heading+'\n'+x.text),
            ...packet.captions.map(x=>x.label+'\n'+x.text),
            ...packet.tables.map(x=>x.label+'\n'+x.text)].join('\n');
          if(packet.sourceSha256!==await sha256(canonical))
            throw Error('oa_science_hash_mismatch');
          // Persist only after all DOI, rights, content and hash checks pass.
          await batchDbOp(db,'packets','put',{doi:row.doi,packet,checkedAt:Date.now()});
          status='saved_local';saved++;
        }catch(e){
          status=String(e?.message||'oa_source_unavailable').slice(0,70);
          if(!/^oa_|^source_/.test(status))status='oa_source_unavailable';
          if(status==='source_rate_limited')rateLimited=true;
          if(status==='oa_license_restricted'||status==='oa_license_unknown')rightsPending++;
          failed++;
        }
        attempted++;
        try{
          await batchDbOp(db,'oaAttempts','put',{doi:row.doi,journal:row.journal,
            revision:row.revision,sourceRevision:BATCH_OA_SOURCE_REVISION,
            status,checkedAt:Date.now(),runId,source:'europe_pmc_oa'});
        }catch(_){batchStatusWrite({lastError:'本机OA诊断记录未成功保存：'+row.doi});}
        batchStatusWrite({attempted,saved,rightsPending,failed,lastDoi:row.doi,
          currentStage:status,lastError:status==='saved_local'?'':status});
        if(rateLimited){batchStatusWrite({lastError:'官方OA接口限流；本轮已停止，未处理条目下次继续'});break;}
        if(!batchPaused)await batchWait(BATCH_OA_MIN_GAP_MS);
      }
    }finally{
      clearInterval(leaseTimer);
      if(GM_getValue(BATCH_LEASE,null)?.runId===runId)GM_deleteValue(BATCH_LEASE);
      db.close();batchActive=false;
      batchStatusWrite({state:batchPaused||rateLimited?'paused':'finished',
        attempted,saved,failed,rightsPending,finishedAt:Date.now()});
      batchPaused=false;
    }
  }

  function batchHistoricalPapers(catalog){
    if(!catalog||catalog.pairedCaptureRegistry!==true
      ||!Array.isArray(catalog.articles)||catalog.articles.length>BATCH_DOI_LIMIT
      ||Number(catalog.webpageDoiCount)!==catalog.articles.length)
      throw Error('正式 DOI 目录不一致，停止补抓');
    const groups=new Map(),seen=new Set();
    for(const raw of catalog.articles){
      const doi=normalizeDoi(raw?.doi);
      const date=String(raw?.date||'');
      if(!doi||seen.has(doi)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=CUTOFF)continue;
      const journal=String(raw.journal||'').trim();
      if(!journal)continue;
      seen.add(doi);
      const entry={doi,publication:date,journal,title:String(raw.title||'').slice(0,1000)};
      if(!groups.has(journal))groups.set(journal,[]);
      groups.get(journal).push(entry);
    }
    const buckets=[...groups].sort(([a],[b])=>a.localeCompare(b))
      .map(([,items])=>items.sort((a,b)=>a.publication.localeCompare(b.publication)||a.doi.localeCompare(b.doi)));
    const chosen=[];
    while(chosen.length<seen.size){
      let took=false;
      for(const b of buckets){if(b.length){chosen.push(b.shift());took=true;}}
      if(!took)break;
    }
    return chosen;
  }
  function batchLicenseEvidence(root){
    const candidates=[];
    document.querySelectorAll('link[rel="license" i],meta[name="citation_license_url" i],meta[name="dc.rights" i],meta[name="license" i],meta[property="article:license" i]').forEach(el=>{
      const raw=String(el.content||el.href||el.getAttribute('href')||'');
      if(raw)candidates.push(raw);
    });
    if(root){
      root.querySelectorAll('[itemprop="license"] a[href],a[rel="license"][href],a[href*="creativecommons.org/licenses/"],a[href*="creativecommons.org/publicdomain/zero/"]').forEach(el=>{
        if(!excluded(el,true))candidates.push(String(el.href||el.getAttribute('href')||''));
      });
      // On verified publisher article pages, the CC URL is frequently written
      // as plain text (including the publisher's legacy http:// permalink)
      // under "Rights and permissions" rather than as a <link rel=license>.
      // Only accept this exact article-scoped legal notice, never a reference
      // section, citation, recommended article or generic page footer.
      root.querySelectorAll('section').forEach(section=>{
        const title=cleanText(section.querySelector('h2,h3,h4')?.textContent||'',120);
        if(!/^(?:rights and permissions|open access|licen[cs](?:e|ing)?|copyright)\b/i.test(title))return;
        const text=cleanText(section.textContent,10000);
        if(!/\bthis article is licensed under a creative commons\b/i.test(text))return;
        const urls=text.match(/https?:\/\/creativecommons\.org\/(?:licenses\/[\w.-]+(?:\/[\w.-]+)*|publicdomain\/zero\/1\.0)\/?/ig)||[];
        candidates.push(...urls);
        // The current article's own legal section can state the complete
        // attribution licence in text, without a clickable CC URL.
        if(!/\b(?:non.?commercial|no.?derivatives|by-nc|by-nd)\b/i.test(text)){
          const exact=/\bThis article is licensed under a Creative Commons Attribution (3\.0|4\.0) International License\b/i.exec(text);
          if(exact)candidates.push('https://creativecommons.org/licenses/by/'+exact[1]+'/');
        }
      });
      // ACS may display a DOI-specific CC BY copyright notice as visible
      // article metadata without a rel=license link or license URL.
      // Require the exact publisher/article copyright sentence inside the
      // current article, not a related card, footer, generic OA badge or TDM hint.
      if(publisher(location.hostname)==='acs'){
        const article=document.querySelector('main article, article')||root;
        let checked=0;
        for(const node of article.querySelectorAll('p,span,small,div')){
          if(++checked>800)break;
          if(node.children?.length||excluded(node,true))continue;
          const notice=cleanText(node.textContent,550);
          const match=/^©\s*20\d{2}\s+The Authors\.\s*Published by American Chemical Society\s+This publication is licensed under a Creative Commons Attribution (3\.0|4\.0) International License\.?$/i.exec(notice);
          if(match)candidates.push('https://creativecommons.org/licenses/by/'+match[1]+'/');
        }
      }
    }
    const matches=candidates.map(raw=>{
      try{
        const url=new URL(raw,location.origin);
        // Creative Commons often uses http in its published license notice.
        // Normalize ONLY an exact Creative Commons host/path; never fetch it.
        if(!['http:','https:'].includes(url.protocol)||url.hostname!=='creativecommons.org')
          return null;
        if(/^\/licenses\/by\/(?:3\.0|4\.0)\/?$/.test(url.pathname))
          return {kind:'cc-by',licenseUrl:'https://creativecommons.org'+url.pathname};
        if(/^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname))
          return {kind:'cc0',licenseUrl:'https://creativecommons.org'+url.pathname};
      }catch(_){}
      return null;
    }).filter(Boolean);
    const distinct=[...new Set(matches.map(x=>x.licenseUrl))];
    return distinct.length===1?matches[0]:null;
  }

  function batchOpenDb(){
    return new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined')return reject(Error('IndexedDB unavailable'));
      const req=indexedDB.open(BATCH_DB,2);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('packets'))db.createObjectStore('packets',{keyPath:'doi'});
        if(!db.objectStoreNames.contains('attempts'))db.createObjectStore('attempts',{keyPath:'doi'});
        if(!db.objectStoreNames.contains('oaAttempts'))db.createObjectStore('oaAttempts',{keyPath:'doi'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('local_storage_failed'));
    });
  }
  function batchDbOp(db,store,method,value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,method==='get'||method==='getAllKeys'?'readonly':'readwrite');
      const request=method==='getAllKeys'?tx.objectStore(store).getAllKeys()
        :tx.objectStore(store)[method](value);
      let completedValue;
      request.onsuccess=()=>{completedValue=request.result;};
      request.onerror=()=>reject(request.error||Error('local_db_request_failed'));
      tx.onerror=()=>reject(tx.error||Error('local_db_transaction_failed'));
      tx.onabort=()=>reject(tx.error||Error('local_db_transaction_aborted'));
      // A request succeeding does not prove the IndexedDB transaction committed.
      tx.oncomplete=()=>resolve(completedValue);
    });
  }
  const BATCH_STATUS_LABELS={
    saved_local:'已存入本机',license_not_verified:'已检查本文许可声明，未确认可复用授权',
    license_pending_load:'本文许可还可能在加载；等待结束后仍未核实（最近文章页供检查）',
    body_missing:'科学正文不足',doi_unverified:'出版社 DOI 不匹配',
    publisher_unreachable:'未能打开出版社页面',publisher_no_response:'出版社标签页未回传',
    timeout:'出版社页面无回执（原因未明）',page_unavailable:'文章页不可用',
    page_access_blocked:'检测到登录／人机验证页',page_http_error:'已观察到出版社页面 HTTP 错误',
    too_large:'正文数据超过体积上限',invalid_response:'采集回执无法识别（与网页 HTTP 错误不同）',
    capture_failed:'正文提取异常',unsupported_publisher:'不支持该出版社页面',
    response_hash_mismatch:'正文来源哈希不一致',
    storage_failure:'本机数据库写入未完成',local_storage_failed:'本机存储不可用',
    publisher_script_not_confirmed:'出版社脚本未启动或未确认',
    report_upload_failed:'服务器诊断上报失败',other:'未能确认具体原因'
  };
  function batchDiagnosticLabel(code){
    return BATCH_STATUS_LABELS[String(code||'')]||BATCH_STATUS_LABELS.other;
  }
  function batchPublisher(doi){
    const s=String(doi||'');
    return s.startsWith('10.1021/')?'acs':s.startsWith('10.1002/')?'wiley'
      :s.startsWith('10.1038/')?'nature':s.startsWith('10.1126/')?'science'
      :s.startsWith('10.1039/')?'rsc':s.startsWith('10.1016/')?'elsevier'
      :s.startsWith('10.31635/')?'ccs':'unknown';
  }
  function batchReportToken(){
    return String(GM_getValue(BATCH_DIAG_TOKEN,'')||'').trim();
  }
  function batchReportKeys(){
    try{return GM_listValues().filter(key=>String(key).startsWith(BATCH_DIAG_PREFIX));}
    catch(_){return [];}
  }
  function batchReportStatus(patch){
    const prev=GM_getValue(BATCH_DIAG_STATE,{})||{};
    GM_setValue(BATCH_DIAG_STATE,Object.assign({},prev,patch,{at:Date.now()}));
    batchUi?.refresh();
  }
  function batchQueueDiagnostic(job,kind,status,stage,reasonCode,details={}){
    try{
      const keys=batchReportKeys();
      if(keys.length>=BATCH_DIAG_MAX_PENDING){
        batchReportStatus({state:'outbox_full',pending:keys.length,
          error:'历史诊断待发队列已满，已有记录不会被丢弃'});
        return false;
      }
      const eventId='htext_'+batchId();
      const sourceReason=String(reasonCode||'other');
      const allowed=['started','publisher_unreachable','publisher_no_response','doi_unverified',
        'license_not_verified','license_pending_load','body_missing','page_unavailable','page_access_blocked',
        'page_http_error','too_large','timeout','invalid_response','capture_failed',
        'unsupported_publisher','response_hash_mismatch','storage_failure',
        'local_storage_failed','publisher_script_not_confirmed','report_upload_failed',
        'saved_local','other'];
      const code=allowed.includes(sourceReason)?sourceReason:'other';
      const payload={schemaVersion:BATCH_DIAG_SCHEMA,eventId,doi:job.doi,
        runId:'hist_'+job.runId,jobId:'hist_'+job.token,kind,
        status,stage,reasonCode:code,
        httpStatus:Number.isInteger(details.httpStatus)&&details.httpStatus>=100
          &&details.httpStatus<=599?details.httpStatus:null,
        publisher:batchPublisher(job.doi),
        pageDoiVerified:details.pageDoiVerified===true,
        sectionCount:Math.min(300,Math.max(0,Number(details.sectionCount||0))),
        evidenceChars:Math.min(400000,Math.max(0,Number(details.evidenceChars||0))),
        scriptVersion:BATCH_SCRIPT_VERSION,occurredAt:new Date().toISOString()};
      GM_setValue(BATCH_DIAG_PREFIX+eventId,{payload,createdAt:Date.now(),tries:0,nextAt:0});
      batchReportStatus({state:batchReportToken()?'queued':'token_missing',
        pending:keys.length+1,error:''});
      // A diagnostic failure must never interrupt, block or mark text acquisition successful.
      void batchDrainReports();
      return eventId;
    }catch(_){return false;}
  }
  function batchHttpRequest(options){
    return new Promise((resolve,reject)=>{
      try{
        GM_xmlhttpRequest({...options,
          timeout:10000,
          onload:r=>resolve(r),
          onerror:()=>reject(Error('diagnostic_transport_error')),
          ontimeout:()=>reject(Error('diagnostic_transport_timeout'))});
      }catch(_){reject(Error('diagnostic_transport_error'));}
    });
  }
  async function batchDrainReports(force=false){
    if(location.hostname!=='gallery.gczhouwld.com'||batchDiagBusy)return;
    const token=batchReportToken();
    if(!token){
      if(batchReportKeys().length)batchReportStatus({state:'token_missing',
        pending:batchReportKeys().length,error:'未设置历史诊断上报密钥，记录保留本机'});
      return;
    }
    batchDiagBusy=true;
    try{
      const ready=batchReportKeys().map(key=>({key,item:GM_getValue(key,null)}))
        .filter(row=>row.item&&(force||Number(row.item.nextAt||0)<=Date.now()))
        .sort((a,b)=>Number(a.item.createdAt||0)-Number(b.item.createdAt||0));
      for(const {key,item} of ready.slice(0,4)){
        try{
          const response=await batchHttpRequest({method:'POST',url:BATCH_REPORT_ENDPOINT,
            headers:{'content-type':'application/json',authorization:'Bearer '+token},
            data:JSON.stringify(item.payload)});
          let body={};try{body=JSON.parse(String(response.responseText||'{}'));}catch(_){}
          if(Number(response.status)!==200||body.stored!==true
            ||body.eventId!==item.payload.eventId||body.doi!==item.payload.doi
            ||body.attemptId!==item.payload.jobId)throw Error(
              Number(response.status)===401?'diagnostic_owner_auth_required':
                'diagnostic_receipt_not_confirmed');
          const current=GM_getValue(key,null);
          if(current?.payload?.eventId===item.payload.eventId)GM_deleteValue(key);
          const acks=GM_getValue(BATCH_DIAG_ACK,{})||{};
          acks[item.payload.doi]={eventId:item.payload.eventId,confirmedAt:Date.now(),
            attemptId:body.attemptId,status:item.payload.status};
          const trimmed=Object.entries(acks)
            .sort((a,b)=>Number(b[1]?.confirmedAt||0)-Number(a[1]?.confirmedAt||0))
            .slice(0,1200);
          GM_setValue(BATCH_DIAG_ACK,Object.fromEntries(trimmed));
          batchReportStatus({state:'delivered',lastDoi:item.payload.doi,
            lastAttempt:body.attemptId,pending:batchReportKeys().length,error:''});
        }catch(error){
          const now=Date.now();
          const next=GM_getValue(key,null);
          if(next?.payload?.eventId===item.payload.eventId){
            const attempts=Math.min(12,Number(next.tries||0)+1);
            next.tries=attempts;
            next.nextAt=now+Math.min(300000,5000*(2**Math.min(attempts,6)));
            GM_setValue(key,next);
          }
          // Never transmit/echo Authorization headers, publisher URLs or raw exception strings.
          const type=String(error?.message||'').startsWith('diagnostic_owner_auth')
            ?'密钥未通过服务器验证':'服务器不可用或尚未确认接收';
          batchReportStatus({state:type.startsWith('密钥')?'auth_failed':'retry',
            pending:batchReportKeys().length,error:type});
          if(type.startsWith('密钥'))break;
        }
      }
    }finally{batchDiagBusy=false;batchUi?.refresh();}
  }
  function batchStartDiagnostics(){
    if(batchDiagStarted||location.hostname!=='gallery.gczhouwld.com')return;
    batchDiagStarted=true;
    // One independent outbox sender on Gallery. No media controller state or token read.
    setInterval(()=>{void batchDrainReports();},10000);
    void batchDrainReports();
  }
  // Keep at most two unresolved DOI-verified article tabs for inspection.
  function batchFinishPublisherTab(tab,result,doi){
    if(!tab)return false;
    const uncertain=result?.pageDoiVerified===true
      &&['license_pending_load','license_not_verified'].includes(result?.status)
      &&![403,429].includes(Number(result?.httpStatus||0));
    if(!uncertain){try{tab.close?.();}catch(_){};return false;}
    batchReviewTabs.push({doi,tab});
    while(batchReviewTabs.length>BATCH_MAX_REVIEW_TABS){
      const oldest=batchReviewTabs.shift();
      try{oldest?.tab?.close?.();}catch(_){}
    }
    batchStatusWrite({reviewTabs:batchReviewTabs.length,reviewLastDoi:doi});
    return true;
  }
  function batchCloseReviewTabs(){
    for(const item of batchReviewTabs.splice(0)){
      try{item.tab?.close?.();}catch(_){}
    }
    batchStatusWrite({reviewTabs:0,reviewLastDoi:''});
  }
  function batchRetryAllowed(prior,manualBlocked=false){
    if(!prior)return true;
    if(prior.status==='saved_local')return false; // Stored packet is separately upgrade-eligible only once.
    // Never treat a documented 403/429 or login challenge as a reason to force a visit.
    if([403,429].includes(Number(prior.httpStatus||0)))return manualBlocked===true;
    // 527 already visited: no publisher-script evidence is not a reason for an
    // unlimited new automatic sweep. The administrator may opt into a small pilot.
    if(['timeout','publisher_no_response','publisher_script_not_confirmed'].includes(prior.status)
      &&prior.pageDoiVerified!==true){
      // Exactly one automatic replay after the publisher binding revision.
      return manualBlocked===true||(prior.captureRevision!==BATCH_CAPTURE_REVISION
        &&![403,429].includes(Number(prior.httpStatus||0)));
    }
    if(prior.status==='page_access_blocked'||prior.status==='doi_unverified'
      ||prior.status==='unsupported_publisher')return manualBlocked===true;
    // The scientific-body parser/ACS license adapter changed: re-evaluate prior
    // DOI-verified false negatives ONCE, and record the revision on the next attempt.
    if((prior.status==='license_not_verified'||prior.status==='license_pending_load'||prior.status==='body_missing')
      &&prior.pageDoiVerified===true
      &&prior.captureRevision!==BATCH_CAPTURE_REVISION)return true;
    if(prior.status==='license_not_verified'||prior.status==='license_pending_load'||prior.status==='body_missing')
      return manualBlocked===true;
    return true;
  }
  function batchNormalizedStatus(raw){
    return BATCH_ERRORS.has(String(raw||''))?String(raw):'invalid_response';
  }
  function batchStageForStatus(status){
    const code=String(status||'');
    if(code==='license_not_verified')return 'license';
    if(code==='license_pending_load')return 'publisher_wait';
    if(code==='body_missing'||code==='capture_failed'||code==='too_large')return 'body_extract';
    if(code==='doi_unverified')return 'publisher_doi';
    if(['page_http_error','page_access_blocked','page_unavailable'].includes(code))return 'publisher_page';
    if(code==='response_hash_mismatch')return 'hash_verify';
    if(code==='storage_failure'||code==='local_storage_failed'||code==='saved_local')return 'local_store';
    if(code==='publisher_unreachable')return 'publisher_open';
    if(code==='timeout'||code==='publisher_no_response'||code==='publisher_script_not_confirmed'||code==='invalid_response')
      return 'publisher_wait';
    return 'finished';
  }

  function batchStatusWrite(patch){
    batchStatus=Object.assign({},batchStatus||{},patch,{at:Date.now()});
    GM_setValue(BATCH_STATE,batchStatus);
    if(batchUi)batchUi.refresh();
  }
  async function batchShowFailures(area,term=''){
    const db=await batchOpenDb(),rows=[];
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction('attempts','readonly');
      const request=transaction.objectStore('attempts').openCursor();
      request.onerror=()=>reject(request.error||Error('attempts_cursor_error'));
      request.onsuccess=()=>{
        const cur=request.result;
        if(!cur)return resolve();
        rows.push(cur.value);
        cur.continue();
      };
      transaction.onabort=()=>reject(transaction.error||Error('attempts_transaction_error'));
    });
    db.close();
    const needle=String(term||'').trim().toLowerCase();
    const filtered=rows.filter(x=>x.status!=='saved_local'
      &&(!needle||[x.doi,x.journal,x.status,x.stage,batchDiagnosticLabel(x.status)]
        .some(v=>String(v||'').toLowerCase().includes(needle))))
      .sort((a,b)=>Number(b.checkedAt||0)-Number(a.checkedAt||0));
    area.replaceChildren();
    const heading=document.createElement('div');
    heading.textContent='本机受阻记录 '+filtered.length+' 篇（最新 40 篇；不代表全库失败）';
    area.append(heading);
    const acks=GM_getValue(BATCH_DIAG_ACK,{})||{};
    for(const item of filtered.slice(0,40)){
      const row=document.createElement('div');
      row.style.cssText='padding:5px 0;border-top:1px solid #ddd';
      const link=document.createElement('a');
      link.href='https://doi.org/'+item.doi;
      link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.doi;
      const details=document.createElement('div');
      const ack=acks[item.doi];
      const reported=item.reportEventId
        ?(ack?.eventId===item.reportEventId?'服务器已确认':'报告待发送／待确认')
        :'旧版历史记录，尚未上报';
      const when=Number.isFinite(Number(item.checkedAt))
        ?new Date(Number(item.checkedAt)).toLocaleString():'时间未知';
      const code=String(item.reasonCode||item.status||'other');
      const pieces=[batchDiagnosticLabel(code),'阶段：'+String(item.stage||'未记录'),
        '时间：'+when,item.httpStatus?'HTTP '+item.httpStatus:'HTTP 未知',
        '报告：'+reported];
      if(item.rightsSignal)pieces.push('授权证据：'+String(item.rightsSignal));
      if(item.bodyEvidence?.presence)pieces.push('正文结构：'+String(item.bodyEvidence.presence)
        +' · 科学正文字符量 '+Number(item.bodyEvidence.scienceChars||0));
      if(item.bodyCompleteness&&item.bodyCompleteness!=='not_saved')
        pieces.push('完整性：'+String(item.bodyCompleteness));
      if(item.navigationMode)pieces.push('导航：'+(item.navigationMode==='acs_direct'?'ACS直接入口':'DOI解析入口'));
      if(item.reasonDetail)pieces.push('说明：'+String(item.reasonDetail).slice(0,70));
      details.textContent=pieces.join(' · ');
      row.append(link,details);area.append(row);
    }
  }
  // Preserve checkpoints without making two events appear as two failed papers.
  // The scope is one publisher attempt, uniquely keyed by DOI and task jobId.
  function batchGroupServerEvents(items){
    const groups=new Map();
    for(const event of Array.isArray(items)?items:[]){
      if(!event||typeof event!=='object'||!event.doi||!event.jobId)continue;
      const key=String(event.doi)+'|'+String(event.jobId);
      if(!groups.has(key))groups.set(key,{
        doi:String(event.doi),jobId:String(event.jobId),events:[],display:null});
      groups.get(key).events.push(event);
    }
    return [...groups.values()].map(group=>{
      group.events.sort((a,b)=>Number(b.receivedAt||0)-Number(a.receivedAt||0));
      // A final result, when present, supersedes interim publisher checkpoints.
      group.display=group.events.find(e=>e.kind==='final_result')||group.events[0];
      group.latestAt=Math.max(...group.events.map(x=>Number(x.receivedAt||0)));
      return group;
    }).sort((a,b)=>b.latestAt-a.latestAt);
  }
  async function batchShowServerReports(area){
    const token=batchReportToken();
    if(!token){area.textContent='请先配置诊断上报密钥，服务器报告仅管理员可查。';return;}
    area.textContent='正在核对服务器记录…';
    try{
      const response=await batchHttpRequest({method:'GET',
        url:BATCH_REPORT_ENDPOINT+'?limit=100',
        headers:{authorization:'Bearer '+token,accept:'application/json'}});
      const body=JSON.parse(String(response.responseText||'{}'));
      if(Number(response.status)===401){
        area.textContent='密钥已保存，但服务器返回 HTTP 401；如凭证已更换，请点击「更换诊断密钥」。';
        return;
      }
      if(Number(response.status)!==200||!Array.isArray(body.items))
        throw Error('no_valid_read_receipt');
      const groups=batchGroupServerEvents(body.items);
      const uniqueDois=new Set(groups.map(x=>x.doi)).size;
      area.replaceChildren();
      const header=document.createElement('div');
      header.textContent='服务器返回 '+body.items.length+' 条事件，归并 '+groups.length
        +' 次尝试／'+uniqueDois+' 篇 DOI（仅最近100条，不是全库统计）';
      area.append(header);
      for(const group of groups.slice(0,45)){
        const event=group.display;
        const wrapper=document.createElement('details');
        wrapper.style.cssText='padding:5px 0;border-top:1px solid #ddd';
        const heading=document.createElement('summary');
        heading.style.cssText='cursor:pointer;word-break:break-word';
        const code=String(event.reasonCode||'other');
        heading.textContent=group.doi+' · '+batchDiagnosticLabel(code)
          +' ['+code+'] · '+String(event.stage||'未知阶段')
          +' · '+(Number.isInteger(event.httpStatus)?'HTTP '+event.httpStatus:'HTTP 未知')
          +' · '+(event.kind==='final_result'?'最终结果':'中途检查点')
          +' · '+new Date(group.latestAt).toLocaleString();
        wrapper.append(heading);
        const context=document.createElement('div');
        context.textContent='尝试标识：'+group.jobId.slice(-12)
          +' · 本次 '+group.events.length+' 条事件'
          +' · DOI 已核验：'+(event.pageDoiVerified===true?'是':'否/未确认')
          +' · 科学正文字符数：'+Number(event.evidenceChars||0);
        wrapper.append(context);
        for(const stage of group.events){
          const line=document.createElement('div');
          line.textContent='  '+(stage.kind==='final_result'?'最终':'检查点')+' · '
            +batchDiagnosticLabel(stage.reasonCode)+' ['+String(stage.reasonCode)+']'
            +' · '+String(stage.stage||'')
            +' · '+(Number.isInteger(stage.httpStatus)?'HTTP '+stage.httpStatus:'HTTP 未知')
            +' · '+new Date(Number(stage.receivedAt||0)).toLocaleString();
          wrapper.append(line);
        }
        area.append(wrapper);
      }
      if(body.hasMore===true){
        const more=document.createElement('div');
        more.textContent='还有更早的事件未显示，请按 DOI 精准复查；当前不是全库日志。';
        area.append(more);
      }
    }catch(_){area.textContent='暂时无法读取服务器报告；本机诊断不受影响。';}
  }
  function batchPanel(){
    if(document.getElementById('osg-historical-batch'))return null;
    const root=document.createElement('div');
    root.id='osg-historical-batch';
    root.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147482500;width:300px;max-width:calc(100vw - 24px);background:#fff;color:#172439;border:1px solid #b7c9dd;border-radius:12px;box-shadow:0 4px 18px #15263c33;padding:10px;font:13px/1.5 system-ui,sans-serif';
    const head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px';
    const label=document.createElement('strong');label.textContent='历史正文 · 独立补抓';
    const hide=document.createElement('button');hide.textContent='−';hide.title='折叠';
    const panel=document.createElement('div');
    const message=document.createElement('div');
    message.style.cssText='margin:7px 0;font-size:12px;line-height:1.5;color:#41576e;white-space:pre-wrap';
    const controls=document.createElement('div');controls.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
    const start=document.createElement('button');start.textContent='一键补抓全部缺项';
    const openOa=document.createElement('button');openOa.textContent='全库开放正文补抓（本机）';
    const coverageButton=document.createElement('button');coverageButton.textContent='全库正文覆盖';
    const closeReview=document.createElement('button');closeReview.textContent='关闭待核实页';
    const pause=document.createElement('button');pause.textContent='暂停';
    const failures=document.createElement('button');failures.textContent='失败详情';
    const server=document.createElement('button');server.textContent='服务器报告';
    const configure=document.createElement('button');configure.textContent='配置诊断密钥';
    const upload=document.createElement('button');upload.textContent='立即上传待发诊断';
    const recheck=document.createElement('button');recheck.textContent='复查受阻项';
    const acsRecheck=document.createElement('button');acsRecheck.textContent='抽查 ACS 许可项（最多10篇）';
    const evidencePilot=document.createElement('button');
    evidencePilot.textContent='跨期刊正文证据核验（12篇）';
    const receiptPilot=document.createElement('button');
    receiptPilot.textContent='出版社回执核验（最多8篇）';
    const search=document.createElement('input');search.placeholder='检索本机正文（LMCT/CO₂等）';
    search.style.cssText='width:100%;box-sizing:border-box;margin:8px 0 4px;padding:5px';
    const results=document.createElement('div');
    const coverageDetails=document.createElement('div');
    coverageDetails.style.cssText='white-space:pre-wrap;max-height:180px;overflow:auto;font-size:12px;display:none;margin:6px 0';
    const filter=document.createElement('input');
    filter.placeholder='筛选失败 DOI／原因';filter.style.cssText='width:100%;box-sizing:border-box;margin:6px 0;padding:5px;display:none';
    const failureDetails=document.createElement('div');
    failureDetails.style.cssText='max-height:220px;overflow:auto;display:none;font-size:11px;word-break:break-word';
    const ownerSecret=document.createElement('input');
    ownerSecret.type='password';ownerSecret.placeholder='本机管理员 Bridge 上报密钥';
    ownerSecret.autocomplete='off';ownerSecret.style.cssText='width:100%;box-sizing:border-box;margin:6px 0;padding:5px;display:none';
    const saveSecret=document.createElement('button');saveSecret.textContent='保存并上传诊断';
    saveSecret.style.cssText='display:none;cursor:pointer;border:1px solid #b8c9df;border-radius:6px;padding:5px';
    results.style.cssText='max-height:140px;overflow:auto;font-size:12px;word-break:break-word';
    for(const btn of [start,openOa,coverageButton,closeReview,pause,failures,server,configure,upload,recheck,acsRecheck,evidencePilot,receiptPilot,hide]){
      btn.style.cssText='cursor:pointer;background:#eaf1f9;border:1px solid #b8c9df;border-radius:6px;padding:4px 8px;color:#172439';
    }
    controls.append(start,openOa,coverageButton,closeReview,pause,failures,server,configure,upload,recheck,acsRecheck,evidencePilot,receiptPilot);
    panel.append(message,controls,coverageDetails,ownerSecret,saveSecret,filter,failureDetails,search,results);
    head.append(label,hide);root.append(head,panel);
    document.body.append(root);
    let collapsed=false;hide.addEventListener('click',()=>{
      collapsed=!collapsed;panel.style.display=collapsed?'none':'block';hide.textContent=collapsed?'+':'−';
    });
    const refresh=()=>{
      const s=GM_getValue(BATCH_STATE,{})||{};
      const progress=[s.state==='loading'?'读取全库注册表中':s.state==='running'?'运行中':s.state==='paused'?'已暂停':s.state==='finished'?'本轮结束':'未启动',
        '已尝试 '+Number(s.attempted||0)+' / '+Number(s.total||0),
        '本机新增 '+Number(s.saved||0)+'；已存在 '+Number(s.existing||0),
        '许可待核实 '+Number(s.rightsPending||0)+'；其他受阻 '+Number(s.failed||0),
        '留供检查的出版社页 '+Number(s.reviewTabs||0)+' / '+BATCH_MAX_REVIEW_TABS,
        s.currentStage?'当前阶段：'+s.currentStage:'',
        s.lastDoi?'当前/最近：'+s.lastDoi:'',
        s.lastError?'本地错误：'+String(s.lastError).slice(0,85):''].filter(Boolean);
      const diag=GM_getValue(BATCH_DIAG_STATE,{})||{};
      const tokenConfigured=Boolean(batchReportToken());
      configure.textContent=tokenConfigured?'更换诊断密钥':'配置诊断密钥';
      upload.disabled=!tokenConfigured||batchDiagBusy||batchReportKeys().length===0;
      progress.push('诊断密钥：'+(tokenConfigured?'已保存（仅本浏览器脚本）':'尚未配置'));
      progress.push('诊断报告：'+(diag.state==='delivered'?'服务器已确认':
        diag.state==='auth_failed'?'上报密钥无效':
        diag.state==='token_missing'?'未配置密钥（仅本机）':
        diag.state==='retry'?'网络失败待重传':
        diag.state==='outbox_full'?'待发队列已满':'本机待发送')
        +' · 待发 '+batchReportKeys().length);
      message.textContent=progress.join('\n');
      start.disabled=batchActive||s.state==='loading';
      openOa.disabled=batchActive||s.state==='loading';
      coverageButton.disabled=false;
      pause.disabled=!batchActive;
      pause.textContent=batchPaused?'准备暂停…':'暂停';
    };
    coverageButton.addEventListener('click',()=>{
      coverageDetails.style.display='block';
      coverageDetails.textContent='正在对齐正式 DOI 与本机正文台账…';
      void (async()=>{
        const catalog=await batchLoadCanonicalCatalog(true);
        const db=await batchOpenDb();
        let keys,attempts,oaAttempts;
        try{
          keys=await batchDbOp(db,'packets','getAllKeys');
          attempts=await batchDbOp(db,'attempts','getAll');
          oaAttempts=await batchDbOp(db,'oaAttempts','getAll');
        }finally{db.close();}
        const formalMembers=new Set(catalog.articles.map(x=>x.doi));
        const savedFormal=keys.filter(x=>formalMembers.has(x)).length;
        const c=batchCoverageSummary(catalog,keys,attempts);
        const first=c.neverAttempted,post=c.parserRecheckEligible;
        coverageDetails.textContent=[
          '正式目录 '+c.formalDois+' 篇；已核实日期的历史 DOI '+c.historicalWithVerifiedDate+' 篇',
          '其余正式 DOI（含10月以来和日期待核实）：'+c.historicalWithoutVerifiedDate+' 篇',
          '全库本机已存科学正文 '+savedFormal+' 篇（含官方OA和出版社来源，未联网共享）；官方OA来源记录 '+oaAttempts.length+' 篇',
          '本机已存科学正文 '+c.savedLocal+' 篇；从未访问 '+first+' 篇',
          '许可待核实 '+c.licensePending+'；科学正文不足 '+c.bodyMissing,
          '访问／身份受阻 '+c.accessBlocked+'；暂时故障 '+c.temporaryFailure,
          '其他待核查 '+c.otherFailure+'；新版解析可复查一次 '+post,
          '普通批次计划访问 '+c.scheduledByNormalBatch+' 篇（不等于历史母数）',
          '本机数据不会自动进入 Gallery 公共全文索引。'
        ].join('\n');
      })().catch(()=>{coverageDetails.textContent=
        '正式目录或本机数据库暂时无法完整读取；未推断任何历史 DOI 已完成。';});
    });
    closeReview.addEventListener('click',batchCloseReviewTabs);
    openOa.addEventListener('click',()=>void batchStartOfficialOa().catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    start.addEventListener('click',()=>void batchStart(false).catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    pause.addEventListener('click',()=>{batchPaused=true;pause.disabled=true;batchStatusWrite({state:'pausing'});});
    recheck.addEventListener('click',()=>void batchStart(true,'blocked').catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    acsRecheck.addEventListener('click',()=>void batchStart(true,'acs_license').catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    evidencePilot.addEventListener('click',()=>void batchStart(true,'pilot').catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    receiptPilot.addEventListener('click',()=>void batchStart(true,'reachability').catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    failures.addEventListener('click',()=>{
      const showing=failureDetails.style.display==='none';
      failureDetails.style.display=showing?'block':'none';
      filter.style.display=showing?'block':'none';
      if(showing)void batchShowFailures(failureDetails,filter.value).catch(()=>{
        failureDetails.textContent='本机失败记录读取失败';
      });
    });
    filter.addEventListener('input',()=>void batchShowFailures(failureDetails,filter.value).catch(()=>{
      failureDetails.textContent='筛选失败记录时出错';
    }));
    server.addEventListener('click',()=>{
      failureDetails.style.display='block';filter.style.display='none';
      void batchShowServerReports(failureDetails);
    });
    configure.addEventListener('click',()=>{
      const show=ownerSecret.style.display==='none';
      ownerSecret.style.display=show?'block':'none';
      saveSecret.style.display=show?'inline-block':'none';
      ownerSecret.value='';
    });
    upload.addEventListener('click',()=>{
      if(batchReportToken())void batchDrainReports(true);
    });
    saveSecret.addEventListener('click',()=>{
      const token=ownerSecret.value.trim();
      if(!token||token.length<12||token.length>512){
        window.alert('管理员密钥长度无效。请在本机填入现有 Bridge 写入密钥，不要发送到聊天。');
        return;
      }
      GM_setValue(BATCH_DIAG_TOKEN,token);
      ownerSecret.value='';ownerSecret.style.display='none';
      saveSecret.style.display='none';
      batchReportStatus({state:'queued',error:'',pending:batchReportKeys().length});
      void batchDrainReports(true);
    });
    let searchToken=0;
    search.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      const ticket=++searchToken;
      void batchSearchLocal(search.value,results,()=>ticket===searchToken).catch(()=>{
        if(ticket===searchToken)results.textContent='本机索引读取失败';
      });
    });
    GM_registerMenuCommand('Gallery：打开历史正文一键补抓面板',()=>{
      collapsed=false;panel.style.display='block';hide.textContent='−';root.scrollIntoView({block:'nearest'});
    });
    return {refresh};
  }
  function batchLocalSearchTerms(query){
    const value=cleanText(query,150).toLocaleLowerCase();
    // Chemistry-specific exact equivalents, never broad Ce/Fe/free-radical substitutions.
    const groups={
      lmct:['lmct','ligand-to-metal charge transfer','ligand to metal charge transfer',
        '配体到金属电荷转移','配体-金属电荷转移'],
      cpa:['cpa','chiral phosphoric acid','chiral phosphoric acids','手性磷酸'],
      '手性磷酸':['手性磷酸','chiral phosphoric acid','chiral phosphoric acids','cpa'],
      '轴手性':['轴手性','axial chirality','atropisomer','atroposelectiv','axially chiral']
    };
    return [...new Set(groups[value]||[value])];
  }
  function batchLocalEvidenceMatch(packet,terms){
    if(!packet||!Array.isArray(packet.sections))return null;
    const rows=[
      ...packet.sections.map(s=>({kind:'正文',label:s.heading||'正文',
        type:String(s.type||'other'),text:String(s.text||'')})),
      ...(packet.captions||[]).map(c=>({kind:'图注',label:c.label||'图注',
        type:'caption',text:String(c.text||'')})),
      ...(packet.tables||[]).map(t=>({kind:'表格',label:t.label||'表格',
        type:'table',text:String(t.text||'')}))
    ];
    const ranks={results:6,scope:6,mechanism:6,experimental:5,
      caption:5,table:5,other:3,conclusion:3,abstract:2,introduction:1};
    let best=null;
    for(const row of rows){
      const text=row.text.toLocaleLowerCase();
      let first=-1;
      for(const term of terms){
        const idx=text.indexOf(term);
        if(idx>=0&&(first<0||idx<first))first=idx;
      }
      if(first<0)continue;
      const score=ranks[row.type]||3;
      if(best&&best.score>=score)continue;
      best={kind:row.kind,label:row.label,type:row.type,score,
        excerpt:row.text.slice(Math.max(0,first-50),Math.min(row.text.length,first+140))};
    }
    return best;
  }
  async function batchSearchLocal(query,area,isCurrent=()=>true){
    const needle=cleanText(query,150);
    if(needle.length<2){area.textContent='至少输入两个字符';return;}
    const terms=batchLocalSearchTerms(needle);
    area.textContent='扫描当前浏览器已存的科学正文、图注及表格…';
    const db=await batchOpenDb();
    const matches=[];
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('packets','readonly');
        const req=tx.objectStore('packets').openCursor();
        req.onerror=()=>reject(req.error||Error('local_search_cursor'));
        tx.onerror=()=>reject(tx.error||Error('local_search_transaction'));
        tx.onabort=()=>reject(tx.error||Error('local_search_aborted'));
        req.onsuccess=()=>{
          const cur=req.result;
          if(!cur)return;
          const packet=cur.value?.packet;
          const evidence=batchLocalEvidenceMatch(packet,terms);
          if(evidence&&packet?.doi)matches.push({doi:packet.doi,...evidence});
          cur.continue();
        };
        tx.oncomplete=resolve;
      });
    }finally{db.close();}
    if(!isCurrent())return;
    matches.sort((a,b)=>b.score-a.score||a.doi.localeCompare(b.doi));
    let shown=0;
    const render=()=>{
      if(!isCurrent())return;
      area.replaceChildren();
      const count=document.createElement('div');
      count.textContent='本机正文命中 '+matches.length+' 篇（仅当前浏览器，非全站）；'
        +'段落提及不代表文章主要贡献。';
      area.append(count);
      if(!matches.length)return;
      for(const item of matches.slice(0,shown)){
        const a=document.createElement('a');
        a.href='https://doi.org/'+item.doi;a.target='_blank';a.rel='noopener noreferrer';
        a.textContent=item.doi+' · '+item.kind+' · '+item.label;
        const desc=document.createElement('div');desc.textContent=item.excerpt;
        const row=document.createElement('div');
        row.style.cssText='border-top:1px solid #ddd;padding:5px 0;word-break:break-word';
        row.append(a,desc);area.append(row);
      }
      if(shown<matches.length){
        const more=document.createElement('button');
        more.textContent='显示更多命中（剩余 '+(matches.length-shown)+' 篇）';
        more.style.cssText='cursor:pointer;margin-top:6px';
        more.addEventListener('click',()=>{
          shown=Math.min(matches.length,shown+20);render();
        });
        area.append(more);
      }
    };
    shown=Math.min(matches.length,20);
    render();
  }
  // Canonical publisher routes adapted from the TOC mainline, without
  // using a publisher URL as evidence of DOI identity or text permission.
  function publisherAllowedForForeground(doi){
    return ['acs','wiley','nature','science','rsc','elsevier','ccs'].includes(batchPublisher(doi));
  }
  function batchPublisherArticleUrl(paper,navigationMode=''){
    const doi=normalizeDoi(paper?.doi),kind=batchPublisher(doi);
    if(!doi)return '';
    if(navigationMode==='doi_resolver')return 'https://doi.org/'+doi;
    if(kind==='acs')return 'https://pubs.acs.org/doi/'+doi;
    if(kind==='wiley')return 'https://onlinelibrary.wiley.com/doi/'+doi;
    if(kind==='nature')return 'https://www.nature.com/articles/'+doi.split('/').slice(1).join('/');
    if(kind==='science')return 'https://www.science.org/doi/'+doi;
    if(kind==='rsc'){
      const m=/^([a-z])(\d)([a-z]{2})/i.exec(doi.split('/')[1]||'');
      if(m)return 'https://pubs.rsc.org/en/content/articlehtml/'+(2020+Number(m[2]))
        +'/'+m[3].toLowerCase()+'/'+doi.split('/')[1];
    }
    return 'https://doi.org/'+doi;
  }
  function batchPublisherRedirectUrl(raw){
    try{
      const u=new URL(String(raw||''));
      if(u.protocol!=='https:'||u.username||u.password)return '';
      const host=u.hostname.toLowerCase();
      if(host==='linkinghub.elsevier.com'){
        const m=/\/pii\/([a-z0-9]+)/i.exec(u.pathname);
        return m?'https://www.sciencedirect.com/science/article/pii/'+m[1]:'';
      }
      if((host==='www.sciencedirect.com'||host==='www.cell.com')
        &&/^\/(?:science\/article\/(?:abs\/)?pii|content\/article\/pii)\//.test(u.pathname))
        return u.origin+u.pathname;
    }catch(_){}
    return '';
  }
  async function batchResolvePublisherTaskUrl(paper,navigationMode=''){
    const url=batchPublisherArticleUrl(paper,navigationMode);
    if(batchPublisher(paper?.doi)!=='elsevier'||navigationMode==='doi_resolver')return url;
    // Resolve a publisher PII route once, as the TOC acquisition controller does.
    // The actual article still needs its own exact DOI metadata.
    try{
      const response=await new Promise((resolve,reject)=>{
        GM_xmlhttpRequest({method:'GET',url:'https://doi.org/'+normalizeDoi(paper.doi),
          timeout:9500,onload:resolve,
          onerror:()=>reject(Error('doi_resolution_failed')),
          ontimeout:()=>reject(Error('doi_resolution_timeout'))});
      });
      return batchPublisherRedirectUrl(response.finalUrl||response.responseURL||'')||url;
    }catch(_){return url;}
  }
  function batchUnconfirmedPublisherResult(sawProgress){
    return sawProgress
      ?{status:'timeout',stage:'publisher_wait',reasonCode:'publisher_no_response'}
      :{status:'publisher_script_not_confirmed',stage:'publisher_wait',
        reasonCode:'publisher_script_not_confirmed',pageDoiVerified:false,httpStatus:null};
  }
  async function batchAwaitResponse(job){
    const start=Date.now();
    let lastSeenStage='',sawHandlerProgress=false;
    while(Date.now()-start<BATCH_LIMIT_MS){
      if(batchPaused)return {status:'paused'};
      const progress=GM_getValue(BATCH_PROGRESS,null);
      const progressIdentity=progress?.stage+'|'+(progress?.failed?'failed':'active');
      if(progress?.runId===job.runId&&progress?.token===job.token){
        sawHandlerProgress=true;
      }
      if(progress?.runId===job.runId&&progress?.token===job.token
         &&progressIdentity!==lastSeenStage){
        lastSeenStage=progressIdentity;
        batchStatusWrite({currentStage:progress.stage});
        if(progress.failed===true&&progress.reasonCode){
          batchQueueDiagnostic(job,'failure_checkpoint','failed',
            batchStageForStatus(progress.reasonCode),progress.reasonCode,{
              pageDoiVerified:progress.pageDoiVerified===true,
              sectionCount:progress.sectionCount||0,evidenceChars:progress.evidenceChars||0,
              httpStatus:progress.httpStatus??null
            });
        }
      }
      const value=GM_getValue(BATCH_RESULT,null);
      if(value&&value.token===job.token&&value.doi===job.doi
        &&value.runId===job.runId)return value;
      // Small, opt-in reachability test: if no matching script heartbeat
      // arrives, do not spend the normal 24 s pretending this is body failure.
      if(!sawHandlerProgress&&Date.now()-start>=BATCH_NO_HANDLER_PILOT_MS)
        return batchUnconfirmedPublisherResult(false);
      await batchWait(350);
    }
    return batchUnconfirmedPublisherResult(sawHandlerProgress);
  }
  function batchCoverageSummary(catalog,existingKeys,attemptRows){
    const papers=batchHistoricalPapers(catalog);
    const saved=new Set(existingKeys||[]);
    const previous=new Map((attemptRows||[]).map(row=>[row.doi,row]));
    const coverage={formalDois:Number(catalog?.formalCount||0),
      historicalWithVerifiedDate:papers.length,
      historicalWithoutVerifiedDate:Math.max(0,Number(catalog?.articles?.length||0)-papers.length),
      savedLocal:0,neverAttempted:0,licensePending:0,bodyMissing:0,
      accessBlocked:0,temporaryFailure:0,otherFailure:0,
      scheduledByNormalBatch:0,parserRecheckEligible:0};
    for(const paper of papers){
      if(saved.has(paper.doi)){coverage.savedLocal++;continue;}
      const prior=previous.get(paper.doi);
      if(!prior){coverage.neverAttempted++;continue;}
      if(prior.status==='license_not_verified'||prior.status==='license_pending_load')coverage.licensePending++;
      else if(prior.status==='body_missing')coverage.bodyMissing++;
      else if(['page_access_blocked','page_http_error','doi_unverified'].includes(prior.status)
        ||[403,429].includes(Number(prior.httpStatus||0)))coverage.accessBlocked++;
      else if(['timeout','publisher_no_response','publisher_unreachable',
        'storage_failure','local_storage_failed','response_hash_mismatch'].includes(prior.status))
        coverage.temporaryFailure++;
      else coverage.otherFailure++;
      if((prior.status==='license_not_verified'||prior.status==='license_pending_load'||prior.status==='body_missing')
        &&prior.pageDoiVerified===true&&prior.captureRevision!==BATCH_CAPTURE_REVISION
        &&![403,429].includes(Number(prior.httpStatus||0)))coverage.parserRecheckEligible++;
    }
    coverage.scheduledByNormalBatch=batchSelectCandidates(
      papers,saved,attemptRows,false,'all').length;
    return coverage;
  }
  function batchSelectCandidates(papers,existing,attemptRows,manualBlocked=false,mode='all'){
    const previous=new Map((attemptRows||[]).map(x=>[x.doi,x]));
    const selected=[];
    for(const paper of papers){
      if(existing.has(paper.doi))continue;
      const prior=previous.get(paper.doi);
      if(mode==='blocked'&&!prior)continue;
      if(mode==='acs_license'
        &&(batchPublisher(paper.doi)!=='acs'||!['license_not_verified','license_pending_load'].includes(prior?.status)))
        continue;
      if(mode==='reachability'&&(!prior||prior.pageDoiVerified===true
        ||!['timeout','publisher_no_response','publisher_script_not_confirmed'].includes(prior.status)
        ||[403,429].includes(Number(prior.httpStatus||0))))continue;
      // Real publisher pilot is an explicitly initiated, bounded DOI sample.
      // Exclude observed publisher denial/challenge; do not bypass auth.
      if(mode==='pilot'&&(!prior||prior.pageDoiVerified!==true
        ||!['license_not_verified','license_pending_load','body_missing'].includes(prior.status)
        ||[403,429].includes(Number(prior.httpStatus||0))))continue;
      if(!batchRetryAllowed(prior,manualBlocked)
        &&!(prior?.status==='saved_local'&&prior?.captureRevision!==BATCH_CAPTURE_REVISION
          &&prior?.bodyCompleteness==='partial'&&!existing.has(paper.doi)))continue;
      selected.push(paper);
      if(mode==='acs_license'&&selected.length>=10)break;
    }
    if(mode==='pilot'||mode==='reachability'){
      const groups=new Map();
      for(const paper of selected){
        if(!groups.has(paper.journal))groups.set(paper.journal,[]);
        groups.get(paper.journal).push(paper);
      }
      const balanced=[];
      const pilotLimit=mode==='reachability'?8:12;
      while(balanced.length<pilotLimit&&[...groups.values()].some(g=>g.length)){
        for(const group of groups.values()){
          if(group.length&&balanced.length<pilotLimit)balanced.push(group.shift());
        }
      }
      return balanced;
    }
    return selected;
  }
  async function batchStart(manualBlocked=false,mode='all'){
    if(batchActive)return;
    batchStatusWrite({state:'loading',source:'publisher',total:0,attempted:0,
      currentStage:'一次读取完整 DOI 注册表并核对正式发布集合',lastError:''});
    const current=GM_getValue(BATCH_LEASE,null);
    if(current&&current.until>Date.now()){
      window.alert('已有一个历史正文批次在当前浏览器运行；请在原页面暂停后操作。');
      return;
    }
    const catalog=await batchLoadCanonicalCatalog();
    const papers=batchHistoricalPapers(catalog);
    if(!papers.length){window.alert('正式目录中暂无 2026-10-01 前的文献');return;}
    const db=await batchOpenDb();
    let existing,attempts,selected,alreadySavedCount=0;
    try{
      const savedKeys=await batchDbOp(db,'packets','getAllKeys');
      attempts=await batchDbOp(db,'attempts','getAll');
      alreadySavedCount=savedKeys.length;
      const previous=new Map(attempts.map(row=>[row.doi,row]));
      // Existing partial science from an earlier parser may be upgraded once,
      // but only after a better verified replacement has actually been captured.
      existing=new Set(savedKeys.filter(doi=>{
        const row=previous.get(doi);
        return !(row?.status==='saved_local'&&row?.bodyCompleteness==='partial'
          &&row?.captureRevision!==BATCH_CAPTURE_REVISION);
      }));
      selected=batchSelectCandidates(papers,existing,attempts,manualBlocked,mode);
    }catch(error){db.close();throw error;}
    if(!selected.length){
      db.close();
      batchStatusWrite({state:'finished',total:0,attempted:0,saved:0,
        existing:alreadySavedCount,rightsPending:0,failed:0,skipped:papers.length,
        currentStage:'finished',lastError:'当前筛选范围无须访问的 DOI'});
      return;
    }
    const label=mode==='reachability'?'仅核验此前无回执的出版社脚本执行（最多8篇）'
      :mode==='pilot'?'跨期刊正文/许可证证据核验（不保证保存）'
      :mode==='acs_license'?'仅抽查此前许可待核实的 ACS 文章'
      :mode==='blocked'?'重新检查此前已受阻的文章':'开始独立补抓';
    if(!window.confirm(label+'：'+selected.length+' 篇正式历史 DOI？\n逐篇打开出版社页面，仅保存有明确 CC BY/CC0 授权的本文正文到本机；不抓 PDF/图/SI，不触碰媒体队列。浏览器需保持开启。')){
      db.close();return;
    }
    const competing=GM_getValue(BATCH_LEASE,null);
    if(competing&&competing.until>Date.now()){
      db.close();window.alert('已有历史正文批次正在运行，未建立第二个队列。');return;
    }
    const runId=batchId();
    batchRunId=runId;batchActive=true;batchPaused=false;
    let attempted=0,saved=0,rightsPending=0,failed=0,
      skipped=papers.length-selected.length;
    const leaseTimer=setInterval(()=>{
      if(batchActive)GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    },4000);
    GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    batchStatusWrite({state:'running',runId,total:selected.length,attempted:0,
      saved:0,existing:alreadySavedCount,rightsPending:0,failed:0,skipped:0,
      currentStage:'queued',lastError:'',startedAt:Date.now(),lastDoi:''});
    try{
      for(const paper of selected){
        if(batchPaused)break;
        const token=batchId();
        const navigationMode=mode==='reachability'
          &&batchPublisher(paper.doi)==='acs'&&attempted%2===1?'doi_resolver':'publisher_direct';
        let job={runId,token,doi:paper.doi,publication:paper.publication,
          title:paper.title,journal:paper.journal,expiresAt:Date.now()+BATCH_LIMIT_MS,
          pilotMode:mode==='reachability'?'reachability':'',navigationMode};
        GM_deleteValue(BATCH_RESULT);GM_deleteValue(BATCH_PROGRESS);GM_setValue(BATCH_JOB,job);
        batchStatusWrite({lastDoi:paper.doi,currentStage:'publisher_open'});
        let result={status:'publisher_unreachable',stage:'publisher_open'};
        try{
          const resolved=await batchResolvePublisherTaskUrl(paper,navigationMode);
          if(!resolved)throw Error('publisher_route_missing');
          const navigate=(record)=>resolved+'#gallery-historical-job='+record.token;
          batchTab=GM_openInTab(navigate(job),
            {active:false,insert:true,setParent:true});
          if(!batchTab||typeof batchTab.close!=='function')
            throw Error('publisher_tab_handle_unavailable');
          result=await batchAwaitResponse(job);
          // TOC's ACS/wiley startup recovery: one *foreground* retry if the
          // first background tab never produced a script heartbeat. No rerun
          // of observed 403/429, auth challenges, or uncertain licenses.
          if(result.status==='publisher_script_not_confirmed'&&!batchPaused
            &&navigationMode!=='doi_resolver'&&publisherAllowedForForeground(paper.doi)){
            try{batchTab.close();}catch(_){}
            batchTab=null;GM_deleteValue(BATCH_RESULT);GM_deleteValue(BATCH_PROGRESS);
            job={...job,token:batchId(),expiresAt:Date.now()+BATCH_LIMIT_MS,foregroundRetry:true};
            GM_setValue(BATCH_JOB,job);
            batchStatusWrite({currentStage:'publisher_foreground_retry',lastDoi:paper.doi});
            batchTab=GM_openInTab(navigate(job),
              {active:true,insert:true,setParent:true});
            if(!batchTab||typeof batchTab.close!=='function')
              throw Error('publisher_retry_tab_handle_unavailable');
            result=await batchAwaitResponse(job);
          }
        }catch(_){result={status:'publisher_unreachable',stage:'publisher_open'};}
        finally{
          batchFinishPublisherTab(batchTab,result,paper.doi);
          batchTab=null;GM_deleteValue(BATCH_JOB);GM_deleteValue(BATCH_RESULT);
        }
        if(result.status==='paused')break;
        attempted++;
        let status=batchNormalizedStatus(result.status);
        const evidenceMeta={pageDoiVerified:result.pageDoiVerified===true,
          sectionCount:Number(result.sectionCount||0),evidenceChars:Number(result.evidenceChars||0),
          httpStatus:Number(result.httpStatus||0)||null};
        const rightsSignal=['cc_reuse_verified','other_license_declared','unverified']
          .includes(result.rightsSignal)?result.rightsSignal:'unverified';
        const bodyEvidence=result.bodyEvidence&&
          ['scientific_sections','partial_science','abstract_only','page_shell']
            .includes(result.bodyEvidence.presence)?{
              presence:result.bodyEvidence.presence,
              scienceChars:Math.min(400000,Math.max(0,Number(result.bodyEvidence.scienceChars||0))),
              abstractChars:Math.min(400000,Math.max(0,Number(result.bodyEvidence.abstractChars||0))),
              sectionCount:Math.min(300,Math.max(0,Number(result.bodyEvidence.sectionCount||0))),
              captionCount:Math.min(200,Math.max(0,Number(result.bodyEvidence.captionCount||0))),
              tableCount:Math.min(80,Math.max(0,Number(result.bodyEvidence.tableCount||0)))
            }:null;
        let stage=String(result.stage||batchStageForStatus(status));
        if(result.status==='ok'){
          const packet=result.packet;
          if(packet?.doi===paper.doi&&packet?.publication===paper.publication
             &&packet?.sourceSha256===result.sourceSha256
             &&packet?.rightsStatus==='local_only_permission_to_be_verified'
             &&packet?.publicUploadAllowed===false
             &&packet?.pdfDownloaded===false&&packet?.mediaDownloaded===false
             &&JSON.stringify(packet).length<=BATCH_MAX_RESPONSE_CHARS){
            try{
              const canonical=[...packet.sections.map(x=>x.heading+'\n'+x.text),
                ...packet.captions.map(x=>x.label+'\n'+x.text),
                ...packet.tables.map(x=>x.label+'\n'+x.text)].join('\n');
              if(await sha256(canonical)!==packet.sourceSha256){
                status='response_hash_mismatch';stage='hash_verify';
              }else{
                const old=await batchDbOp(db,'packets','get',paper.doi);
                const quality=source=>{
                  const p=source?.packet||source||{},c=p.coverage||{};
                  const tier=p.bodyCompleteness==='complete_candidate'?3:
                    p.bodyCompleteness==='partial'?2:1;
                  return tier*1000000+Number(c.scienceChars||p.characters||0);
                };
                if(old&&quality(packet)<=quality(old)){
                  // Never replace a proven longer/more complete existing source
                  // with a partial capture from a different publisher template.
                  status='body_missing';stage='body_extract';
                }else{
                  await batchDbOp(db,'packets','put',{doi:paper.doi,packet,checkedAt:Date.now()});
                  saved++;existing.add(paper.doi);status='saved_local';stage='local_store';
                }
                evidenceMeta.pageDoiVerified=true;
                evidenceMeta.sectionCount=packet.sections.length;
                evidenceMeta.evidenceChars=Number(packet.characters||canonical.length);
              }
            }catch(_){status='storage_failure';stage='local_store';}
          }
        }
        if(status==='license_not_verified'||status==='license_pending_load')rightsPending++;
        else if(status!=='saved_local')failed++;
        const localRecord={doi:paper.doi,journal:paper.journal,status,reasonCode:status,
          stage,checkedAt:Date.now(),httpStatus:evidenceMeta.httpStatus,
          pageDoiVerified:evidenceMeta.pageDoiVerified,
          sectionCount:evidenceMeta.sectionCount,evidenceChars:evidenceMeta.evidenceChars,
          runId,jobId:token,captureRevision:BATCH_CAPTURE_REVISION,navigationMode,
          rightsSignal,bodyEvidence,bodyCompleteness:
            status==='saved_local'?String(result.packet?.bodyCompleteness||'partial'):'not_saved',
          reportEventId:''};
        // Save failure evidence before attempting its upload. Server transmission
        // must never be a prerequisite to finishing a publisher DOI.
        try{
          await batchDbOp(db,'attempts','put',localRecord);
        }catch(_){
          batchStatusWrite({lastError:'当前 DOI 的本机诊断保存失败：'+paper.doi});
        }
        const serverStatus=status==='saved_local'?'success':
          status==='license_not_verified'||status==='page_access_blocked'?'blocked':'failed';
        const eventId=batchQueueDiagnostic(job,'final_result',serverStatus,
          stage,status,evidenceMeta);
        if(eventId&&typeof eventId==='string'){
          localRecord.reportEventId=eventId;
          try{await batchDbOp(db,'attempts','put',localRecord);}catch(_){}
        }
        batchStatusWrite({attempted,saved,rightsPending,failed,skipped,lastDoi:paper.doi,
          currentStage:stage,lastError:status==='saved_local'?'':batchDiagnosticLabel(status)});
        GM_deleteValue(BATCH_PROGRESS);
        // One article tab, bounded requests and non-overlapping registry/lease.
        // This delay avoids monopolizing publisher traffic alongside media capture.
        if(!batchPaused)await batchWait(BATCH_MIN_GAP_MS);
      }
    }finally{
      clearInterval(leaseTimer);
      if(GM_getValue(BATCH_LEASE,null)?.runId===runId)GM_deleteValue(BATCH_LEASE);
      GM_deleteValue(BATCH_JOB);GM_deleteValue(BATCH_RESULT);
      db.close();batchActive=false;
      batchStatusWrite({state:batchPaused?'paused':'finished',attempted,saved,
        rightsPending,failed,skipped,finishedAt:Date.now()});
      batchPaused=false;
    }
  }
  // Wait for relevant DOM hydration, not a long fixed sleep or blind 24s timeout.
  // No extra article requests are made. This helps dynamic publishers while
  // allowing a stable, fully loaded page to fail quickly if permission is absent.
  function batchAwaitPublisherDomChange(root,maxMs=420){
    const delay=Math.max(100,Math.min(650,Number(maxMs)||420));
    if(typeof MutationObserver!=='function'||!document.documentElement)
      return batchWait(delay);
    return new Promise(resolve=>{
      let ended=false,obs,timeout;
      const finish=()=>{
        if(ended)return;
        ended=true;
        try{obs?.disconnect();}catch(_){}
        clearTimeout(timeout);resolve();
      };
      try{
        obs=new MutationObserver(records=>{
          if(records.some(r=>r.type==='childList'||r.type==='characterData'
            ||r.attributeName==='href'||r.attributeName==='content'))finish();
        });
        // Licence can appear in metadata or within the article legal notice.
        obs.observe(document.head||document.documentElement,{
          attributes:true,attributeFilter:['href','content'],childList:true,subtree:false
        });
        if(root)obs.observe(root,{childList:true,subtree:true,characterData:true,
          attributes:true,attributeFilter:['href','content']});
        else obs.observe(document.documentElement,{childList:true,subtree:true});
      }catch(_){finish();return;}
      timeout=setTimeout(finish,delay);
    });
  }
  function batchPublisherPageBlocked(){
    const sample=(String(document.title||'')+' '+String(document.body?.innerText||'').slice(0,500))
      .toLowerCase();
    return /access denied|verify you are human|captcha|log in to (?:continue|access)|institutional sign in|challenge required|sign in to continue|automated requests blocked/i.test(sample);
  }
  function batchArticlePageReady(root,evidence=null){
    if(!root||document.readyState==='loading')return false;
    // Static heading count is not a hydration or scientific-content signal.
    const body=evidence||batchBodyStructure(root);
    return ['scientific_sections','partial_science','abstract_only'].includes(body.presence);
  }

  async function batchWorker(){
    if(typeof GM_getValue!=='function')return;
    const job=GM_getValue(BATCH_JOB,null);
    if(!job||job.expiresAt<Date.now()||!publisher(location.hostname)||!job.token||!job.runId)return;
    let phase='publisher_page',verified=false,sectionCount=0,evidenceChars=0;
    let bodyEvidence=null,rightsSignal='unverified';
    function observedPageHttpStatus(){
      // Read the browser's own navigation timing; never initiate extra publisher requests.
      try{
        const response=Number(performance.getEntriesByType('navigation')?.[0]?.responseStatus||0);
        return Number.isInteger(response)&&response>=100&&response<=599?response:null;
      }catch(_){return null;}
    }
    const reportStage=(stage,reasonCode='',failed=false)=>{
      phase=stage;
      GM_setValue(BATCH_PROGRESS,{runId:job.runId,token:job.token,doi:job.doi,
        stage,failed,reasonCode,at:Date.now(),pageDoiVerified:verified,
        sectionCount,evidenceChars,httpStatus:observedPageHttpStatus()});
    };
    const storeResult=data=>{
      const current=GM_getValue(BATCH_JOB,null);
      if(current?.runId!==job.runId||current?.token!==job.token)return;
      const code=data.status==='ok'?'saved_local':String(data.status||'other');
      const stage=data.stage||batchStageForStatus(code);
      reportStage(stage,code,data.status!=='ok');
      GM_setValue(BATCH_RESULT,{runId:job.runId,token:job.token,doi:job.doi,
        at:Date.now(),stage,pageDoiVerified:verified,sectionCount,evidenceChars,
        httpStatus:observedPageHttpStatus(),bodyEvidence,rightsSignal,...data});
    };
    // No need to inherit URL fragments across publisher redirects. The only
    // active tab is DOI-bound and only the explicitly started, live job may run.
    const fragment=/^#gallery-historical-job=([a-f0-9]{24})$/.exec(location.hash||'');
    if(fragment&&fragment[1]!==job.token)return;
    let remembered='';
    try{remembered=sessionStorage.getItem(BATCH_TAB_BIND_KEY)||'';}catch(_){}
    const bound=fragment?.[1]===job.token||remembered===job.token;
    const routeBound=batchPathBindsCurrentJob(job);
    if(!bound&&!routeBound)return; // An unrelated publisher tab is not a worker.
    let doi=pageDoi(),capture=null;
    reportStage('publisher_page'); // Heartbeat before scientific/license hydration.
    if(!bound){
      // Unbound exact DOI routes can explain access errors, but may not
      // persist private scientific text to a job they did not claim.
      if([403,429].includes(observedPageHttpStatus()))
        storeResult({status:'page_http_error',stage:'publisher_page'});
      else if(batchPublisherPageBlocked())
        storeResult({status:'page_access_blocked',stage:'publisher_page'});
      else storeResult({status:'doi_unverified',stage:'publisher_doi'});
      return;
    }
    if(doi&&doi!==job.doi){
      storeResult({status:'doi_unverified',stage:'publisher_doi'});return;
    }
    // A DOI-bound canonical publisher route may lack a DOI meta tag when
    // presenting an authentication challenge. Do not wait for nonexistent
    // fulltext, and never claim DOI verification from the URL alone.
    if(!doi&&batchPublisherPageBlocked()){
      storeResult({status:'page_access_blocked',stage:'publisher_page'});return;
    }
    if([403,429].includes(observedPageHttpStatus())){
      storeResult({status:'page_http_error',stage:'publisher_page'});return;
    }
    const begun=Date.now();
    const probeUntil=Math.min(job.expiresAt-1200,begun+BATCH_PUBLISHER_PROBE_MS);
    let sawArticle=false;
    // DOI, scientific text and article-specific reuse permission hydrate independently.
    // Relevant head/body DOM mutations drive checks; unchanged node counts do not.
    while(Date.now()<probeUntil){
      doi=pageDoi();
      if(doi&&doi!==job.doi){storeResult({status:'doi_unverified',stage:'publisher_doi'});return;}
      if(doi===job.doi){
        verified=true;reportStage('publisher_doi');
        if(batchPublisherPageBlocked()){
          storeResult({status:'page_access_blocked',stage:'publisher_page'});return;
        }
        if([403,429].includes(observedPageHttpStatus())){
          storeResult({status:'page_http_error',stage:'publisher_page'});return;
        }
        const root=batchArticleRoot();
        bodyEvidence=batchBodyStructure(root);
        const ready=batchArticlePageReady(root,bodyEvidence);
        if(ready)sawArticle=true;
        const rights=batchReuseRights(root);
        rightsSignal=rights.signal;
        sectionCount=bodyEvidence.sectionCount;evidenceChars=bodyEvidence.scienceChars;
        reportStage(rights.license?'body_extract':'license');
        if(rights.license&&ready){
          try{
            capture=gather();
            const verifiedScience=capture.sections.filter(row=>
              ['results','scope','optimization','mechanism','experimental'].includes(row.type))
              .reduce((total,row)=>total+String(row.text||'').length,0);
            if(verifiedScience>=250)break;
          }catch(_){capture=null;}
        }
        await batchAwaitPublisherDomChange(root,ready?480:330);
      }else await batchAwaitPublisherDomChange(null,330);
    }
    if(doi!==job.doi){storeResult({status:'doi_unverified',stage:'publisher_doi'});return;}
    const root=batchArticleRoot();
    bodyEvidence=batchBodyStructure(root);
    const ready=batchArticlePageReady(root,bodyEvidence);
    if(!ready&&!sawArticle){storeResult({status:'page_unavailable',stage:'publisher_page'});return;}
    const rights=batchReuseRights(root);
    rightsSignal=rights.signal;
    const license=rights.license;
    sectionCount=bodyEvidence.sectionCount;evidenceChars=bodyEvidence.scienceChars;
    if(!license){
      // Distinguish an observed other licence from a not-yet-hydrated notice.
      const checked=ready&&rights.signal==='other_license_declared';
      storeResult({status:checked?'license_not_verified':'license_pending_load',
        stage:checked?'license':'publisher_wait'});return;
    }
    if(!capture&&ready){try{capture=gather();}catch(_){capture=null;}}
    if(!capture){storeResult({status:'body_missing',stage:'body_extract'});return;}
    const verifiedScientificChars=capture.sections.filter(row=>
      ['results','scope','optimization','mechanism','experimental'].includes(row.type))
      .reduce((total,row)=>total+String(row.text||'').length,0);
    if(verifiedScientificChars<250){storeResult({status:'body_missing',stage:'body_extract'});return;}
    const canonical=[...capture.sections.map(s=>s.heading+'\n'+s.text),
      ...capture.captions.map(s=>s.label+'\n'+s.text),
      ...capture.tables.map(s=>s.label+'\n'+s.text)].join('\n');
    reportStage('hash_verify');
    const sourceSha256=await sha256(canonical);
    const packet={schemaVersion:SCHEMA,doi:job.doi,publication:job.publication,
      journal:job.journal,title:job.title,publisher:publisher(location.hostname),
      sourceUrl:location.origin+location.pathname,capturedAt:new Date().toISOString(),
      sourceSha256,rightsStatus:'local_only_permission_to_be_verified',
      rightsBasis:license.kind,licenseUrl:license.licenseUrl,
      indexEligibility:'local_pilot_only',publicUploadAllowed:false,
      pdfDownloaded:false,mediaDownloaded:false,paragraphs:capture.paragraphCount,
      characters:capture.characterCount,coverage:capture.coverage,
      bodyCompleteness:capture.coverage.completeness,captureRevision:BATCH_CAPTURE_REVISION,
      sections:capture.sections,
      captions:capture.captions,tables:capture.tables};
    if(JSON.stringify(packet).length>BATCH_MAX_RESPONSE_CHARS){
      storeResult({status:'too_large',stage:'body_extract'});return;
    }
    storeResult({status:'ok',stage:'local_store',packet,sourceSha256});
  }

  function batchBoot(){
    if(location.hostname==='gallery.gczhouwld.com'){
      if(location.pathname==='/'||location.pathname==='/index.html'){
        batchUi=batchPanel();batchUi?.refresh();
        if(typeof window.addEventListener==='function')
          window.addEventListener('pagehide',batchCloseReviewTabs,{once:true});
        batchStartDiagnostics();
      }
    }else if(publisher(location.hostname)){
      GM_registerMenuCommand('Gallery：本地导出此历史论文正文（手动）',()=>{void exportCurrent();});
      void batchWorker().catch(()=>{});
    }
  }
  // Capture fragment binding at document-start, but defer DOM work until ready.
  if(document.readyState==='loading'&&typeof document.addEventListener==='function')
    document.addEventListener('DOMContentLoaded',batchBoot,{once:true});
  else batchBoot();
})();