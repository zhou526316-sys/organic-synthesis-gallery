// ==UserScript==
// @name         Gallery Historical Text Search — Local Pilot
// @namespace    https://gallery.gczhouwld.com/
// @version      0.1.0
// @description  Manually export DOI-verified historical article text for local, rights-gated search testing; no PDF/figure download or text upload.
// @author       Organic Synthesis Gallery
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
// @grant        GM_xmlhttpRequest
// @connect      gallery.gczhouwld.com
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
  function excluded(node){
    if(node.closest('nav,aside,footer,form,[role="navigation"],[aria-hidden="true"],figure,table'))return true;
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
      if(excluded(node.closest('figure')||node))continue;
      const text=cleanText(node.textContent,6000);
      if(text.length>20&&captions.length<70&&!captions.some(x=>x.text===text)){
        const m=text.match(/^(Scheme|Figure|Fig\.?|Equation)\s*[0-9A-Za-z().-]*/i);
        captions.push({label:m?m[0]:'Figure',text});
      }
    }
    const tables=[];
    for(const node of root.querySelectorAll('table')){
      if(excluded(node.closest('section')||node))continue;
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
    setTimeout(()=>URL.revokeObjectURL(href),3000);
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
  GM_registerMenuCommand('Gallery：本地导出此历史论文正文（手动）',()=>{void exportCurrent();});
})();