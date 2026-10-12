// ==UserScript==
// @name         Gallery Historical Text Search — Local Pilot
// @namespace    https://gallery.gczhouwld.com/
// @version      0.2.0
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
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      gallery.gczhouwld.com
// @updateURL    https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// @downloadURL  https://gallery.gczhouwld.com/gallery-historical-text-pilot.user.js
// ==/UserScript==

(() => {
  'use strict';
  const CUTOFF='2026-10-01';
  const CATALOG_URL='https://gallery.gczhouwld.com/toc-demand-live.json';
  const SCHEMA='gallery-historical-local-text-pilot-v1';
  const DOI=/^10\.\d{4,9}\/\S+$/;
  const EXCLUDE_HEADING=/^(?:references?|bibliography|acknowledg(?:e)?ments?|author information|associated content|supplementary information|supporting information|funding|conflicts? of interest|data availability)\b/i;
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
        const row={type:/abstract/i.test(heading)?'abstract':/mechanis/i.test(heading)?'mechanism':/result|scope|discussion/i.test(heading)?'results':/experimental|methods/i.test(heading)?'experimental':'other',
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
  const BATCH_LIMIT_MS=24000;
  const BATCH_LEASE_MS=40000;
  const BATCH_RETRY_MS=24*3600*1000;
  const BATCH_MAX_RESPONSE_CHARS=350000;
  const BATCH_MIN_GAP_MS=2000;
  const BATCH_DOI_LIMIT=100000;
  const BATCH_ERRORS=new Set(['doi_unverified','publisher_unreachable','page_unavailable',
    'license_not_verified','body_missing','too_large','timeout','invalid_response','storage_failure',
    'response_hash_mismatch','capture_failed','unsupported_publisher']);
  let batchActive=false,batchPaused=false,batchTab=null,batchStatus=null,batchRunId='',batchUi=null;
  const batchWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function batchId(){
    const bytes=new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
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
    }
    const matches=candidates.map(raw=>{
      try{const url=new URL(raw,location.origin);
        if(url.protocol!=='https:'||url.hostname!=='creativecommons.org')return null;
        if(/^\/licenses\/by\/(?:3\.0|4\.0)\/?$/.test(url.pathname))
          return {kind:'cc-by',licenseUrl:url.origin+url.pathname};
        if(/^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname))
          return {kind:'cc0',licenseUrl:url.origin+url.pathname};
      }catch(_){}
      return null;
    }).filter(Boolean);
    // Source URI alone is not authorization to publish raw fulltext. Batch
    // storage remains device-only pending a separate source/version review.
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
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('local_db_request_failed'));
      tx.onabort=()=>reject(tx.error||Error('local_db_transaction_failed'));
    });
  }
  function batchStatusWrite(patch){
    batchStatus=Object.assign({},batchStatus||{},patch,{at:Date.now()});
    GM_setValue(BATCH_STATE,batchStatus);
    if(batchUi)batchUi.refresh();
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
    const search=document.createElement('input');search.placeholder='检索本机正文（LMCT/CO₂等）';
    search.style.cssText='width:100%;box-sizing:border-box;margin:8px 0 4px;padding:5px';
    const results=document.createElement('div');
    results.style.cssText='max-height:140px;overflow:auto;font-size:12px;word-break:break-word';
    for(const btn of [start,pause,hide]){
      btn.style.cssText='cursor:pointer;background:#eaf1f9;border:1px solid #b8c9df;border-radius:6px;padding:4px 8px;color:#172439';
    }
    controls.append(start,pause);
    panel.append(message,controls,search,results);
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
        '无权限/无许可 '+Number(s.rightsPending||0)+'；其他受阻 '+Number(s.failed||0),
        s.lastDoi?'当前/最近：'+s.lastDoi:''].filter(Boolean);
      message.textContent=progress.join('\n');
      start.disabled=batchActive;
      pause.disabled=!batchActive;
      pause.textContent=batchPaused?'准备暂停…':'暂停';
    };
    start.addEventListener('click',()=>void batchStart().catch(error=>{
      batchActive=false;batchStatusWrite({state:'paused',lastError:String(error?.message||error).slice(0,140)});
    }));
    pause.addEventListener('click',()=>{batchPaused=true;pause.disabled=true;batchStatusWrite({state:'pausing'});});
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
    while(Date.now()-start<BATCH_LIMIT_MS){
      if(batchPaused)return {status:'paused'};
      const value=GM_getValue(BATCH_RESULT,null);
      if(value&&value.token===job.token&&value.doi===job.doi
        &&value.runId===job.runId)return value;
      await batchWait(350);
    }
    return {status:'timeout'};
  }
  async function batchStart(){
    if(batchActive)return;
    const current=GM_getValue(BATCH_LEASE,null);
    if(current&&current.until>Date.now()){
      window.alert('已有一个历史正文批次在当前浏览器运行；请在原页面暂停后操作。');
      return;
    }
    const catalog=await loadCatalog();
    const papers=batchHistoricalPapers(catalog);
    if(!papers.length){window.alert('正式目录中暂无 2026-10-01 前的文献');return;}
    if(!window.confirm('开始独立补抓 '+papers.length+' 篇正式历史 DOI？\n将逐篇在后台打开出版社页面，仅在明确可验证的 CC BY/CC0 许可下保存文本到当前浏览器；不抓 PDF/正文图/SI，不上传原文，也不修改 TOC 队列。浏览器需要保持开启。'))return;
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
      saved:0,existing:existing.size,rightsPending:0,failed:0,skipped:0,startedAt:Date.now(),lastDoi:''});
    try{
      for(const paper of papers){
        if(batchPaused)break;
        if(existing.has(paper.doi)){skipped++;continue;}
        const prior=await batchDbOp(db,'attempts','get',paper.doi);
        if(prior&&Date.now()-Number(prior.checkedAt||0)<BATCH_RETRY_MS
          &&prior.status!=='storage_failure'&&prior.status!=='paused'){skipped++;continue;}
        const token=batchId();
        const job={runId,token,doi:paper.doi,publication:paper.publication,
          title:paper.title,journal:paper.journal,expiresAt:Date.now()+BATCH_LIMIT_MS};
        GM_deleteValue(BATCH_RESULT);GM_setValue(BATCH_JOB,job);
        batchStatusWrite({lastDoi:paper.doi});
        let result={status:'publisher_unreachable'};
        try{
          batchTab=GM_openInTab('https://doi.org/'+paper.doi+'#gallery-historical-job='+token,
            {active:false,insert:false,setParent:true});
          result=await batchAwaitResponse(job);
        }catch(_){result={status:'publisher_unreachable'};}
        finally{
          try{batchTab?.close?.();}catch(_){}
          batchTab=null;GM_deleteValue(BATCH_JOB);GM_deleteValue(BATCH_RESULT);
        }
        if(result.status==='paused')break;
        attempted++;
        let status=BATCH_ERRORS.has(result.status)?result.status:'invalid_response';
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
              if(await sha256(canonical)!==packet.sourceSha256)
                throw Error('response_hash_mismatch');
              await batchDbOp(db,'packets','put',{doi:paper.doi,packet,checkedAt:Date.now()});
              saved++;existing.add(paper.doi);status='saved_local';
            }catch(_){status='storage_failure';}
          }
        }
        if(status==='license_not_verified')rightsPending++;
        else if(status!=='saved_local')failed++;
        await batchDbOp(db,'attempts','put',{doi:paper.doi,status,checkedAt:Date.now()});
        batchStatusWrite({attempted,saved,rightsPending,failed,skipped,lastDoi:paper.doi});
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
    const storeResult=data=>{
      const current=GM_getValue(BATCH_JOB,null);
      if(current?.runId!==job.runId||current?.token!==job.token)return;
      GM_setValue(BATCH_RESULT,{runId:job.runId,token:job.token,doi:job.doi,
        at:Date.now(),...data});
    };
    // No need to inherit URL fragments across publisher redirects. The only
    // active tab is DOI-bound and only the explicitly started, live job may run.
    const fragment=/^#gallery-historical-job=([a-f0-9]{24})$/.exec(location.hash||'');
    if(fragment&&fragment[1]!==job.token)return;
    let doi=pageDoi(),capture=null,reason='';
    // Other article tabs must never claim the queue's response slot.
    if(doi&&doi!==job.doi)return;
    if(!doi&&!fragment)return;
    for(let i=0;i<8;i++){
      if(doi&&doi!==job.doi)return;
      if(doi===job.doi){
        const root=document.querySelector('main article, article, main, [role="main"]');
        const license=batchLicenseEvidence(root);
        if(license){
          try{capture=gather();if(capture.characterCount>=250)break;}catch(e){reason=String(e?.message||e);}
        }else if(i>=2){storeResult({status:'license_not_verified'});return;}
      }
      await batchWait(700);
      doi=pageDoi();
    }
    if(doi!==job.doi){storeResult({status:'doi_unverified'});return;}
    const root=document.querySelector('main article, article, main, [role="main"]');
    const license=batchLicenseEvidence(root);
    if(!license){storeResult({status:'license_not_verified'});return;}
    if(!capture){storeResult({status:'body_missing',reason:reason.slice(0,90)});return;}
    const canonical=[...capture.sections.map(s=>s.heading+'\n'+s.text),
      ...capture.captions.map(s=>s.label+'\n'+s.text),
      ...capture.tables.map(s=>s.label+'\n'+s.text)].join('\n');
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
      storeResult({status:'too_large'});return;
    }
    storeResult({status:'ok',packet,sourceSha256});
  }

  if(location.hostname==='gallery.gczhouwld.com'){
    batchUi=batchPanel();batchUi?.refresh();
  }else{
    GM_registerMenuCommand('Gallery：本地导出此历史论文正文（手动）',()=>{void exportCurrent();});
    void batchWorker().catch(()=>{});
  }
})();