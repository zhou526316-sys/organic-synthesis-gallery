// ==UserScript==
// @name         Gallery Historical Text Search — Local Pilot
// @namespace    https://gallery.gczhouwld.com/
// @version      0.2.3
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
// @run-at       document-idle
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
// @updateURL    https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// @downloadURL  https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// ==/UserScript==

(() => {
  'use strict';
  const CUTOFF='2026-10-01';
  const CATALOG_URL='https://gallery.gczhouwld.com/toc-demand-live.json'; // Legacy manual-only fallback
  const CANONICAL_RELEASE_URL='https://gallery.gczhouwld.com/release-delivery.json';
  const CANONICAL_INDEX_URL='https://api.gczhouwld.com/api/literature/catalog-view';
  const SOURCE_PAGE_LIMIT=100;
  const SOURCE_MAX_PAGES=2500;
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
  function excluded(node, includeMedia=false){
    if(node.closest('nav,aside,footer,form,[role="navigation"],[aria-hidden="true"]'))return true;
    if(!includeMedia&&node.closest('figure,table'))return true;
    for(let current=node;current&&current!==document.body;current=current.parentElement){
      if(EXCLUDE_CONTEXT.test(String(current.id||'')+' '+String(current.className||'')))return true;
    }
    return false;
  }
  function gather(){
    const root=document.querySelector('main article, article, main, [role="main"]');
    if(!root)throw Error('找不到可验证的文章正文容器');
    const sections=[], group=new Map();
    let heading='Article body', isReferences=false, consumed=0, paragraphCount=0;
    for(const node of root.querySelectorAll('h2,h3,p')){
      if(excluded(node))continue;
      if(/^H[23]$/.test(node.tagName)){
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
        const row={type:/^abstract\b/i.test(heading)?'abstract':/mechanis|control experiments?|catalytic cycle/i.test(heading)?'mechanism':/result|scope|discussion|screening|optimization|structure.reactivity/i.test(heading)?'results':/experimental|methods|materials and methods|procedure/i.test(heading)?'experimental':/introduct|background/i.test(heading)?'introduction':/conclusion|outlook|summary/i.test(heading)?'conclusion':'other',
          heading,text:'',order:sections.length};
        group.set(key,row);sections.push(row);
      }
      const row=group.get(key);
      if(row.text.length+value.length<=30000)row.text+=(row.text?'\n\n':'')+value;
    }
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
    return {sections,captions,tables,paragraphCount,characterCount:consumed};
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
  const BATCH_PREFIX='gallery-historical-text-batch-v2:';
  const BATCH_STATE=BATCH_PREFIX+'state';
  const BATCH_JOB=BATCH_PREFIX+'job';
  const BATCH_RESULT=BATCH_PREFIX+'result';
  const BATCH_LEASE=BATCH_PREFIX+'lease';
  const BATCH_DB='gallery-historical-text-local-v2';
  const BATCH_REPORT_ENDPOINT='https://api.gczhouwld.com/api/admin/historical-text/reports';
  const BATCH_DIAG_PREFIX=BATCH_PREFIX+'diagnostics-outbox-v1:';
  const BATCH_DIAG_TOKEN=BATCH_PREFIX+'diagnostics-owner-token';
  const BATCH_DIAG_ACK=BATCH_PREFIX+'diagnostics-acks-v1';
  const BATCH_DIAG_STATE=BATCH_PREFIX+'diagnostics-state-v1';
  const BATCH_PROGRESS=BATCH_PREFIX+'publisher-progress-v1';
  const BATCH_DIAG_MAX_PENDING=1500;
  const BATCH_DIAG_SCHEMA='historical-text-diagnostic-v1';
  const BATCH_LIMIT_MS=24000;
  const BATCH_LEASE_MS=40000;
  const BATCH_RETRY_MS=0; // No blanket 24h lockout; reason-dependent rechecking below.
  const BATCH_MAX_RESPONSE_CHARS=350000;
  const BATCH_MIN_GAP_MS=2000;
  const BATCH_DOI_LIMIT=100000;
  // Keep final-result classification aligned with Worker diagnostic reason enums.
  // A genuine publisher 403/429 must not become 'invalid_response'.
  const BATCH_ERRORS=new Set(['doi_unverified','publisher_unreachable','page_unavailable',
    'page_access_blocked','page_http_error','publisher_no_response',
    'publisher_script_not_confirmed','license_not_verified','body_missing','too_large',
    'timeout','invalid_response','storage_failure','local_storage_failed',
    'response_hash_mismatch','capture_failed','unsupported_publisher']);
  let batchActive=false,batchPaused=false,batchTab=null,batchStatus=null,batchRunId='',batchUi=null;
  let batchDiagBusy=false,batchDiagStarted=false;
  const batchWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function batchId(){
    const bytes=new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function batchFetchJson(url){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',url,timeout:16000,headers:{accept:'application/json'},
        onload(response){
          try{
            const body=String(response.responseText||'');
            if(response.status!==200||body.length>SOURCE_RESULT_MAX_BYTES)
              throw Error('正式目录读取受阻 HTTP '+String(response.status));
            const parsed=JSON.parse(body);
            if(!parsed||typeof parsed!=='object')throw Error('正式目录数据格式错误');
            resolve(parsed);
          }catch(error){reject(error);}
        },
        onerror(){reject(Error('正式文献索引网络访问失败'));},
        ontimeout(){reject(Error('正式文献索引请求超时'))}
      });
    });
  }
  async function batchLoadCanonicalCatalog(){
    const release=await batchFetchJson(CANONICAL_RELEASE_URL);
    const catalogId=String(release.architectureCatalogId||'');
    if(!/^[0-9a-f]{64}$/.test(catalogId)
      ||!Array.isArray(release.dois)
      ||!Number.isSafeInteger(release.productionCards)
      ||release.dois.length!==release.productionCards
      ||release.dois.length>BATCH_DOI_LIMIT)
      throw Error('正式 Pages 文献目录版本不可信');
    const members=new Set();
    for(const raw of release.dois){
      const doi=normalizeDoi(raw);
      if(!doi||members.has(doi))throw Error('正式 DOI 清单不一致');
      members.add(doi);
    }
    const articles=[],seen=new Set();
    let cursor='',matched=null;
    for(let page=0;page<SOURCE_MAX_PAGES;page++){
      const q=new URLSearchParams({
        catalogId,sort:'oldest',dateTo:'2026-09-30',
        limit:String(SOURCE_PAGE_LIMIT)
      });
      if(cursor)q.set('cursor',cursor);
      const response=await batchFetchJson(CANONICAL_INDEX_URL+'?'+q.toString());
      if(response.readPathActive!==true||response.enabled!==true
        ||response.catalogId!==catalogId||!Array.isArray(response.items)
        ||!Number.isSafeInteger(response.matched)
        ||response.items.length>SOURCE_PAGE_LIMIT)
        throw Error('正式文献索引未就绪或目录版本不一致');
      if(matched===null)matched=response.matched;
      else if(matched!==response.matched)throw Error('正式目录分页数量发生变化');
      for(const row of response.items){
        const doi=normalizeDoi(row?.doi);
        if(!doi||!members.has(doi)||seen.has(doi)
          ||!/^[0-9a-f]{64}$/.test(String(row?.revision||''))
          ||!String(row?.journal||'').trim())
          throw Error('正式 DOI 分页存在未知或重复论文');
        seen.add(doi);
        articles.push({doi,date:String(row.firstOnlineDate||''),
          title:String(row.title||'').slice(0,1000),journal:String(row.journal||'').slice(0,140),
          revision:row.revision});
      }
      if(articles.length>matched||articles.length>BATCH_DOI_LIMIT)
        throw Error('正式文献目录容量或去重异常');
      if(response.hasMore!==true){
        if(articles.length!==matched||response.nextCursor)
          throw Error('正式 DOI 分页缺项');
        return {pairedCaptureRegistry:true,webpageDoiCount:articles.length,
          formalCount:release.dois.length,publishedCatalogId:catalogId,articles};
      }
      if(!response.nextCursor||response.nextCursor===cursor||!response.items.length)
        throw Error('正式文献索引分页无法前进');
      cursor=response.nextCursor;
    }
    throw Error('正式文献索引分页超过保护上限');
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
      });
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
      const req=indexedDB.open(BATCH_DB,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('packets'))db.createObjectStore('packets',{keyPath:'doi'});
        if(!db.objectStoreNames.contains('attempts'))db.createObjectStore('attempts',{keyPath:'doi'});
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
    saved_local:'已存入本机',license_not_verified:'文章网页尚未识别到可验证许可（不代表无权阅读）',
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
        'license_not_verified','body_missing','page_unavailable','page_access_blocked',
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
        scriptVersion:'0.2.2',occurredAt:new Date().toISOString()};
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
  async function batchDrainReports(){
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
        .filter(row=>row.item&&Number(row.item.nextAt||0)<=Date.now())
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
    }finally{batchDiagBusy=false;}
  }
  function batchStartDiagnostics(){
    if(batchDiagStarted||location.hostname!=='gallery.gczhouwld.com')return;
    batchDiagStarted=true;
    // One independent outbox sender on Gallery. No media controller state or token read.
    setInterval(()=>{void batchDrainReports();},10000);
    void batchDrainReports();
  }
  function batchRetryAllowed(prior,manualBlocked=false){
    if(!prior)return true;
    if(prior.status==='saved_local')return false;
    const noAutomatic=new Set(['license_not_verified','body_missing','doi_unverified',
      'page_access_blocked','unsupported_publisher']);
    if(noAutomatic.has(prior.status))return manualBlocked===true;
    // Transient timeouts and transport failures can be retried at the user's next click.
    // Explicit HTTP 429/403 signals must not be ignored or bypassed.
    if([403,429].includes(Number(prior.httpStatus||0)))return manualBlocked===true;
    return true;
  }
  function batchNormalizedStatus(raw){
    return BATCH_ERRORS.has(String(raw||''))?String(raw):'invalid_response';
  }
  function batchStageForStatus(status){
    const code=String(status||'');
    if(code==='license_not_verified')return 'license';
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
    const pause=document.createElement('button');pause.textContent='暂停';
    const failures=document.createElement('button');failures.textContent='失败详情';
    const server=document.createElement('button');server.textContent='服务器报告';
    const configure=document.createElement('button');configure.textContent='配置诊断上报';
    const recheck=document.createElement('button');recheck.textContent='复查受阻项';
    const search=document.createElement('input');search.placeholder='检索本机正文（LMCT/CO₂等）';
    search.style.cssText='width:100%;box-sizing:border-box;margin:8px 0 4px;padding:5px';
    const results=document.createElement('div');
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
    for(const btn of [start,pause,failures,server,configure,recheck,hide]){
      btn.style.cssText='cursor:pointer;background:#eaf1f9;border:1px solid #b8c9df;border-radius:6px;padding:4px 8px;color:#172439';
    }
    controls.append(start,pause,failures,server,configure,recheck);
    panel.append(message,controls,ownerSecret,saveSecret,filter,failureDetails,search,results);
    head.append(label,hide);root.append(head,panel);
    document.body.append(root);
    let collapsed=false;hide.addEventListener('click',()=>{
      collapsed=!collapsed;panel.style.display=collapsed?'none':'block';hide.textContent=collapsed?'+':'−';
    });
    const refresh=()=>{
      const s=GM_getValue(BATCH_STATE,{})||{};
      const progress=[s.state==='running'?'运行中':s.state==='paused'?'已暂停':s.state==='finished'?'本轮结束':'未启动',
        '已尝试 '+Number(s.attempted||0)+' / '+Number(s.total||0),
        '本机新增 '+Number(s.saved||0)+'；已存在 '+Number(s.existing||0),
        '许可待核实 '+Number(s.rightsPending||0)+'；其他受阻 '+Number(s.failed||0),
        s.currentStage?'当前阶段：'+s.currentStage:'',
        s.lastDoi?'当前/最近：'+s.lastDoi:'',
        s.lastError?'本地错误：'+String(s.lastError).slice(0,85):''].filter(Boolean);
      const diag=GM_getValue(BATCH_DIAG_STATE,{})||{};
      progress.push('诊断报告：'+(diag.state==='delivered'?'服务器已确认':
        diag.state==='auth_failed'?'上报密钥无效':
        diag.state==='token_missing'?'未配置密钥（仅本机）':
        diag.state==='retry'?'网络失败待重传':
        diag.state==='outbox_full'?'待发队列已满':'本机待发送')
        +' · 待发 '+batchReportKeys().length);
      message.textContent=progress.join('\n');
      start.disabled=batchActive;
      pause.disabled=!batchActive;
      pause.textContent=batchPaused?'准备暂停…':'暂停';
    };
    start.addEventListener('click',()=>void batchStart(false).catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    pause.addEventListener('click',()=>{batchPaused=true;pause.disabled=true;batchStatusWrite({state:'pausing'});});
    recheck.addEventListener('click',()=>void batchStart(true).catch(error=>{
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
      void batchDrainReports();
    });
    let searchToken=0;
    search.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      const ticket=++searchToken;
      void batchSearchLocal(search.value,results).catch(()=>{
        if(ticket===searchToken)results.textContent='本机索引读取失败';
      });
    });
    GM_registerMenuCommand('Gallery：打开历史正文一键补抓面板',()=>{
      collapsed=false;panel.style.display='block';hide.textContent='−';root.scrollIntoView({block:'nearest'});
    });
    return {refresh};
  }
  async function batchSearchLocal(query,area){
    const needle=cleanText(query,100).toLocaleLowerCase();
    if(needle.length<2){area.textContent='至少输入两个字符';return;}
    area.textContent='查询本机索引…';
    const db=await batchOpenDb();
    const hits=[];
    await new Promise((resolve,reject)=>{
      const req=db.transaction('packets','readonly').objectStore('packets').openCursor();
      req.onerror=()=>reject(req.error||Error('cursor'));
      req.onsuccess=()=>{
        const cur=req.result;
        if(!cur||hits.length>=20)return resolve();
        const packet=cur.value.packet;
        for(const sec of packet?.sections||[]){
          const raw=String(sec.text||'');
          const idx=raw.toLocaleLowerCase().indexOf(needle);
          if(idx!==-1){hits.push({doi:packet.doi,heading:sec.heading||'正文',fragment:raw.slice(Math.max(0,idx-35),idx+100)});break;}
        }
        cur.continue();
      };
    });
    db.close();
    area.textContent='';
    if(!hits.length){area.textContent='本机尚无命中（不能代表全站无文献）';return;}
    for(const item of hits){
      const a=document.createElement('a');a.href='https://doi.org/'+item.doi;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=item.doi+' · '+item.heading;
      const desc=document.createElement('div');desc.textContent=item.fragment;
      const row=document.createElement('div');row.style.cssText='border-top:1px solid #ddd;padding:5px 0';row.append(a,desc);area.append(row);
    }
  }
  async function batchAwaitResponse(job){
    const start=Date.now();
    let lastSeenStage='';
    while(Date.now()-start<BATCH_LIMIT_MS){
      if(batchPaused)return {status:'paused'};
      const progress=GM_getValue(BATCH_PROGRESS,null);
      const progressIdentity=progress?.stage+'|'+(progress?.failed?'failed':'active');
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
      await batchWait(350);
    }
    return {status:'timeout',stage:'publisher_wait',reasonCode:'publisher_no_response'};
  }
  async function batchStart(manualBlocked=false){
    if(batchActive)return;
    const current=GM_getValue(BATCH_LEASE,null);
    if(current&&current.until>Date.now()){
      window.alert('已有一个历史正文批次在当前浏览器运行；请在原页面暂停后操作。');
      return;
    }
    const catalog=await batchLoadCanonicalCatalog();
    const papers=batchHistoricalPapers(catalog);
    if(!papers.length){window.alert('正式目录中暂无 2026-10-01 前的文献');return;}
    if(!window.confirm((manualBlocked?'重新检查包括许可／正文受阻项在内的全部候选：':'开始独立补抓 ') +papers.length+' 篇正式历史 DOI？\n逐篇打开出版社页面，仅保存有明确 CC BY/CC0 授权的本文正文到本机；不抓 PDF/图/SI，不触碰媒体队列。浏览器需保持开启。'))return;
    const competing=GM_getValue(BATCH_LEASE,null);
    if(competing&&competing.until>Date.now()){
      window.alert('已有历史正文批次正在运行，未建立第二个队列。');return;
    }
    const db=await batchOpenDb();
    const existing=new Set(await batchDbOp(db,'packets','getAllKeys'));
    const runId=batchId();
    batchRunId=runId;batchActive=true;batchPaused=false;
    let attempted=0,saved=0,rightsPending=0,failed=0,skipped=0;
    const leaseTimer=setInterval(()=>{
      if(batchActive)GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    },4000);
    GM_setValue(BATCH_LEASE,{runId,until:Date.now()+BATCH_LEASE_MS});
    batchStatusWrite({state:'running',runId,total:papers.length,attempted:0,
      saved:0,existing:existing.size,rightsPending:0,failed:0,skipped:0,
      currentStage:'queued',lastError:'',startedAt:Date.now(),lastDoi:''});
    try{
      for(const paper of papers){
        if(batchPaused)break;
        if(existing.has(paper.doi)){skipped++;continue;}
        const prior=await batchDbOp(db,'attempts','get',paper.doi);
        if(!batchRetryAllowed(prior,manualBlocked)){skipped++;continue;}
        const token=batchId();
        const job={runId,token,doi:paper.doi,publication:paper.publication,
          title:paper.title,journal:paper.journal,expiresAt:Date.now()+BATCH_LIMIT_MS};
        GM_deleteValue(BATCH_RESULT);GM_deleteValue(BATCH_PROGRESS);GM_setValue(BATCH_JOB,job);
        batchStatusWrite({lastDoi:paper.doi,currentStage:'publisher_open'});
        let result={status:'publisher_unreachable',stage:'publisher_open'};
        try{
          batchTab=GM_openInTab('https://doi.org/'+paper.doi+'#gallery-historical-job='+token,
            {active:false,insert:false,setParent:true});
          result=await batchAwaitResponse(job);
        }catch(_){result={status:'publisher_unreachable',stage:'publisher_open'};}
        finally{
          try{batchTab?.close?.();}catch(_){}
          batchTab=null;GM_deleteValue(BATCH_JOB);GM_deleteValue(BATCH_RESULT);
        }
        if(result.status==='paused')break;
        attempted++;
        let status=batchNormalizedStatus(result.status);
        const evidenceMeta={pageDoiVerified:result.pageDoiVerified===true,
          sectionCount:Number(result.sectionCount||0),evidenceChars:Number(result.evidenceChars||0),
          httpStatus:Number(result.httpStatus||0)||null};
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
                await batchDbOp(db,'packets','put',{doi:paper.doi,packet,checkedAt:Date.now()});
                saved++;existing.add(paper.doi);status='saved_local';stage='local_store';
                evidenceMeta.pageDoiVerified=true;
                evidenceMeta.sectionCount=packet.sections.length;
                evidenceMeta.evidenceChars=Number(packet.characters||canonical.length);
              }
            }catch(_){status='storage_failure';stage='local_store';}
          }
        }
        if(status==='license_not_verified')rightsPending++;
        else if(status!=='saved_local')failed++;
        const localRecord={doi:paper.doi,journal:paper.journal,status,reasonCode:status,
          stage,checkedAt:Date.now(),httpStatus:evidenceMeta.httpStatus,
          pageDoiVerified:evidenceMeta.pageDoiVerified,
          sectionCount:evidenceMeta.sectionCount,evidenceChars:evidenceMeta.evidenceChars,
          runId,jobId:token,reportEventId:''};
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
  async function batchWorker(){
    if(typeof GM_getValue!=='function')return;
    const job=GM_getValue(BATCH_JOB,null);
    if(!job||job.expiresAt<Date.now()||!publisher(location.hostname)||!job.token||!job.runId)return;
    let phase='publisher_page',verified=false,sectionCount=0,evidenceChars=0;
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
        httpStatus:observedPageHttpStatus(),...data});
    };
    // No need to inherit URL fragments across publisher redirects. The only
    // active tab is DOI-bound and only the explicitly started, live job may run.
    const fragment=/^#gallery-historical-job=([a-f0-9]{24})$/.exec(location.hash||'');
    if(fragment&&fragment[1]!==job.token)return;
    let doi=pageDoi(),capture=null,reason='';
    reportStage('publisher_page');
    if([403,429].includes(observedPageHttpStatus())){
      storeResult({status:'page_http_error',stage:'publisher_page'});return;
    }
    // Other article tabs must never claim the queue's response slot.
    if(doi&&doi!==job.doi)return;
    if(!doi&&!fragment)return;
    for(let i=0;i<8;i++){
      if(doi&&doi!==job.doi)return;
      if(doi===job.doi){
        verified=true;reportStage('publisher_doi');
        const root=document.querySelector('main article, article, main, [role="main"]');
        const license=batchLicenseEvidence(root);
        reportStage('license');
        if(license){
          reportStage('body_extract');
          try{
            capture=gather();
            sectionCount=capture.sections.length;
            evidenceChars=capture.characterCount;
            if(capture.characterCount>=250)break;
          }catch(_){reason='article_body_not_extracted';}
        }else if(i>=2){
          const hint=String(document.title||'')+' '+String(document.body?.innerText||'').slice(0,300);
          if(/access denied|verify you are human|captcha|log in to (?:continue|access)|institutional sign in/i.test(hint))
            storeResult({status:'page_access_blocked',stage:'publisher_page'});
          else storeResult({status:'license_not_verified',stage:'license'});
          return;
        }
      }
      await batchWait(700);
      doi=pageDoi();
    }
    if(doi!==job.doi){storeResult({status:'doi_unverified',stage:'publisher_doi'});return;}
    const root=document.querySelector('main article, article, main, [role="main"]');
    const license=batchLicenseEvidence(root);
    if(!license){storeResult({status:'license_not_verified',stage:'license'});return;}
    if(!capture){storeResult({status:'body_missing',stage:'body_extract'});return;}
    const verifiedScientificChars=capture.sections.filter(row=>
      ['results','mechanism','experimental'].includes(row.type))
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
      characters:capture.characterCount,sections:capture.sections,
      captions:capture.captions,tables:capture.tables};
    if(JSON.stringify(packet).length>BATCH_MAX_RESPONSE_CHARS){
      storeResult({status:'too_large',stage:'body_extract'});return;
    }
    storeResult({status:'ok',stage:'local_store',packet,sourceSha256});
  }

  if(location.hostname==='gallery.gczhouwld.com'){
    // Historical upload sender and UI must not run on PDF or account pages.
    if(location.pathname==='/'||location.pathname==='/index.html'){
      batchUi=batchPanel();batchUi?.refresh();
      batchStartDiagnostics();
    }
  }else{
    GM_registerMenuCommand('Gallery：本地导出此历史论文正文（手动）',()=>{void exportCurrent();});
    void batchWorker().catch(()=>{});
  }
})();