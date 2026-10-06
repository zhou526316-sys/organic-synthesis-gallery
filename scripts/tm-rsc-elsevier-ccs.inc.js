  function rscRouteParts(job) {
    var doi=normalizeDoi(job&&job.doi),suffix=doi.split('/')[1]||'';
    var match=/^([a-z])(\d)([a-z]{2})/i.exec(suffix);
    if(!match)return null;
    return {doi:doi,suffix:suffix.toLowerCase(),year:String(2020+Number(match[2])),code:match[3].toLowerCase()};
  }

  function rscArticleHtmlUrl(job) {
    var row=rscRouteParts(job);
    return row?'https://pubs.rsc.org/en/content/articlehtml/'+row.year+'/'+row.code+'/'+row.suffix:'';
  }

  function rscBodyFigureContext(node, original) {
    if(!node||!node.closest)return original;
    if(original&&(original.label||original.official))return original;
    if(node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[class*="reference" i],[class*="citation" i]'))return null;
    var block=node.closest('.image_table,.image-table,.img-tbl,.article-figure,.figure,figure,[class*="figure-container" i]');
    if(!block)return original;
    var texts=Array.from(block.querySelectorAll(
      '.image_title,.image-title,.figure-title,figcaption,.caption,[class*="caption" i]'
    )).map(function(n){return String(n.textContent||'').replace(/\s+/g,' ').trim();}).filter(Boolean);
    var numbered=texts.filter(function(t){return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(t);});
    var own=[node.getAttribute&&node.getAttribute('alt'),node.getAttribute&&node.getAttribute('title'),node.getAttribute&&node.getAttribute('aria-label')]
      .filter(Boolean).join(' ');
    if(/^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(own))numbered.push(own);
    var labels=Array.from(new Set(numbered.map(function(t){return articleFigureLabel(t,0);})));
    if(labels.length!==1)return original||null;
    return {block:block,label:labels[0],caption:(numbered[0]||texts[0]||own).slice(0,600),official:false};
  }

  function isRscPdfPagePreviewUrl(value) {
    try {
      var url=new URL(String(value||''),location.href);
      return /(?:^|\\.)rscj\\.silverchair-cdn\\.com$/i.test(url.hostname)&&/\\.pdf\\.gif$/i.test(url.pathname);
    } catch (_) {
      return /\\.pdf\\.gif(?:[?#]|$)/i.test(String(value||''));
    }
  }

  function rscGraphicalAbstractCandidates(job, root, baseUrl) {
    if(String(job&&job.publisher||publisherForDoi(normalizeDoi(job&&job.doi)))!=='rsc')return [];
    var scope=root||document,base=baseUrl||location.href,rows=[],seen=new Set();
    function excluded(node){return Boolean(node&&node.closest&&node.closest(
      'aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[class*="reference" i],[class*="citation" i],[class*="advert" i]'
    ));}
    function add(node,score,source,text){
      articleFigureImageUrls(node,base).forEach(function(url,rank){
        if(!url||seen.has(url)||isRscPdfPagePreviewUrl(url)||reject(text,url)||!candidateBelongsToJob(url,job))return;
        seen.add(url);rows.push({url:url,kind:'official',assetType:'graphical_abstract',score:score-rank,
          text:String(text||'Graphical Abstract').slice(0,1000),source:source,element:node.tagName&&node.tagName.toLowerCase()==='img'?node:null});
      });
    }
    if(!scope.querySelectorAll)return rows;
    scope.querySelectorAll('img').forEach(function(img){
      if(excluded(img))return;
      var own=[img.getAttribute('alt'),img.getAttribute('title'),img.getAttribute('aria-label')].filter(Boolean).join(' ');
      var context=contextFor(img);
      if(/\bgraphical\s+abstract\b|\bvisual\s+abstract\b|\btable\s+of\s+contents\s+(?:graphic|image)\b/i.test(own)){
        add(img,960,'rsc_graphical_abstract_alt',own);return;
      }
      if(/\bgraphical\s+abstract\b|\bvisual\s+abstract\b|\btable\s+of\s+contents\s+(?:graphic|image)\b/i.test(context)
          && !/\bFig(?:ure)?\.?\s*\d+/i.test(context)){
        add(img,900,'rsc_graphical_abstract_context',context);
      }
    });
    return rows.sort(function(a,b){return b.score-a.score;});
  }

  function elsevierGraphicalAbstractCandidates(job, root, baseUrl) {
    if(String(job&&job.publisher||publisherForDoi(normalizeDoi(job&&job.doi)))!=='elsevier')return [];
    var scope=root||document,base=baseUrl||location.href,rows=[],seen=new Set();
    if(!scope.querySelectorAll)return rows;
    function add(img,text,score){
      articleFigureImageUrls(img,base).forEach(function(url,rank){
        if(!url||seen.has(url)||reject(text,url)||!candidateBelongsToJob(url,job))return;
        seen.add(url);rows.push({url:url,kind:'official',assetType:'graphical_abstract',score:score-rank,
          text:String(text||'Graphical abstract').slice(0,1000),source:'elsevier_graphical_abstract',element:img});
      });
    }
    scope.querySelectorAll('section,div').forEach(function(block){
      if(block.closest&&block.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[class*="reference" i]'))return;
      var heading=block.querySelector('h1,h2,h3,h4,[role="heading"]');
      var headingText=String(heading&&heading.textContent||'').replace(/\s+/g,' ').trim();
      var marker=[block.id,typeof block.className==='string'?block.className:'',headingText].join(' ');
      if(!/\bgraphical[\s_-]*abstract\b|\bvisual[\s_-]*abstract\b/i.test(marker))return;
      var images=Array.from(block.querySelectorAll('img'));
      if(images.length===1)add(images[0],headingText||marker,940);
      else images.forEach(function(img){var own=[img.alt,img.title,img.getAttribute('aria-label')].filter(Boolean).join(' ');
        if(/graphical\s+abstract|visual\s+abstract/i.test(own))add(img,own,950);});
    });
    return rows.sort(function(a,b){return b.score-a.score;});
  }

  function ccsAssetFigureLabel(value) {
    var raw=String(value||'').split(/[?#]/,1)[0].toLowerCase();
    var match=raw.match(/(?:^|\/)(sf|f)0*(\d+)\.(?:gif|png|jpe?g|webp)$/i);
    if(!match)return '';
    return (match[1].toLowerCase()==='sf'?'Scheme ':'Figure ')+String(Number(match[2]));
  }

  function ccsTocIndexUrlFromCrossrefPayload(job,payload,baseUrl) {
    if(String(job&&job.publisher||publisherForDoi(normalizeDoi(job&&job.doi)))!=='ccs')return '';
    var message=payload&&payload.message&&typeof payload.message==='object'?payload.message:payload||{};
    var volume=String(message.volume||'').trim();
    var issue=String(message.issue||message['journal-issue']&&message['journal-issue'].issue||'').trim();
    if(!/^\d+$/.test(volume)||!/^\d+$/.test(issue))return '';
    var origin;
    try{origin=new URL(baseUrl||location.href).origin;}catch(_){origin='https://www.chinesechemsoc.org';}
    return origin+'/toc/ccschem/'+String(Number(volume))+'/'+String(Number(issue));
  }

  async function ccsCrossrefTocIndexUrl(job,trace) {
    if(String(job&&job.publisher||publisherForDoi(normalizeDoi(job&&job.doi)))!=='ccs')return '';
    var doi=normalizeDoi(job&&job.doi);if(!doi)return '';
    var key=P+'ccs-crossref-route-v1:'+doi,now=Date.now(),cached=GM_getValue(key,null);
    if(cached&&cached.url&&now-Number(cached.at||0)<30*24*60*60*1000){
      pushTrace(trace,{stage:'ccs_toc_route',event:'crossref_cache',status:'found',url:cached.url,message:'volume='+String(cached.volume||'')+';issue='+String(cached.issue||'')});
      return String(cached.url);
    }
    try{
      var payload=await metadataJson({method:'GET',url:'https://api.crossref.org/works/'+encodeURIComponent(doi),timeout:20000,headers:{accept:'application/json'}},'ccs_crossref');
      var url=ccsTocIndexUrlFromCrossrefPayload(job,payload,location.href);
      var message=payload&&payload.message&&typeof payload.message==='object'?payload.message:payload||{};
      if(!url){
        pushTrace(trace,{stage:'ccs_toc_route',event:'crossref_volume_issue',status:'none',message:'volume_or_issue_missing'});
        return '';
      }
      var volume=String(message.volume||'').trim(),issue=String(message.issue||message['journal-issue']&&message['journal-issue'].issue||'').trim();
      GM_setValue(key,{url:url,volume:volume,issue:issue,at:now,revision:PUBLISHER_MEDIA_REVISION});
      pushTrace(trace,{stage:'ccs_toc_route',event:'crossref_volume_issue',status:'found',url:url,message:'volume='+volume+';issue='+issue});
      return url;
    }catch(error){
      pushTrace(trace,{stage:'ccs_toc_route',event:'crossref_volume_issue',status:'failed',message:captureLiveError(error&&error.message||error)});
      return '';
    }
  }

  // CCS Chemistry exposes its official per-article "key image" on journal TOC
  // listings even when the article page exposes only numbered body figures.
  function ccsTocIndexUrls(job, doc, baseUrl) {
    if(String(job&&job.publisher||publisherForDoi(normalizeDoi(job&&job.doi)))!=='ccs')return [];
    var origin;
    try{origin=new URL(baseUrl||location.href).origin;}catch(_){origin='https://www.chinesechemsoc.org';}
    var urls=[origin+'/toc/ccschem/0/0',origin+'/toc/ccschem/0/ja'];
    try{
      var scope=doc||document;
      var volume=String((scope.querySelector('meta[name="citation_volume"]')||{}).content||'').trim();
      var issue=String((scope.querySelector('meta[name="citation_issue"]')||{}).content||'').trim();
      if(/^\d+$/.test(volume)&&/^\d+$/.test(issue))urls.push(origin+'/toc/ccschem/'+volume+'/'+issue);
    }catch(_){}
    return Array.from(new Set(urls));
  }

  function ccsDoiFromTextOrHref(value) {
    var match=String(value||'').toLowerCase().match(/10\.31635\/ccschem\.[a-z0-9.]+/i);
    return match?normalizeDoi(match[0]):'';
  }

  function ccsCardForDoiAnchor(anchor,doi) {
    var node=anchor&&anchor.parentElement;
    for(var depth=0;node&&depth<8;depth+=1,node=node.parentElement){
      var images=node.querySelectorAll?node.querySelectorAll('img,picture,source,object[type^="image"]'):[];
      if(!images.length)continue;
      var found=new Set();
      Array.from(node.querySelectorAll('a[href]')).forEach(function(link){
        var value=ccsDoiFromTextOrHref((link.getAttribute('href')||'')+' '+(link.textContent||''));
        if(value)found.add(value);
      });
      if(found.size===1&&found.has(doi))return node;
      if(found.size>1)return null;
    }
    return null;
  }

  function ccsKeyImageSignal(node,card) {
    var values=[],current=node;
    for(var depth=0;current&&depth<4;depth+=1,current=current.parentElement){
      if(current.getAttribute){
        ['alt','title','aria-label','class','id'].forEach(function(name){var value=current.getAttribute(name);if(value)values.push(value);});
      }
      if(current!==node){var text=String(current.textContent||'').replace(/\s+/g,' ').trim();if(text)values.push(text.slice(0,320));}
      if(current===card)break;
    }
    return /\bkey\s*image\b|\btable\s+of\s+contents\s*(?:graphic|image)\b|\btoc\s*(?:graphic|image)\b|\bgraphical\s+abstract\b|\bvisual\s+abstract\b/i.test(values.join(' '));
  }

  function ccsTocIndexCandidatesFromDocument(job,doc,baseUrl) {
    if(!doc||String(job&&job.publisher||'')!=='ccs')return [];
    var doi=normalizeDoi(job&&job.doi);if(!doi)return [];
    var anchors=Array.from(doc.querySelectorAll('a[href]')).filter(function(anchor){
      return ccsDoiFromTextOrHref((anchor.getAttribute('href')||'')+' '+(anchor.textContent||''))===doi;
    });
    var rows=[],seen=new Set();
    anchors.forEach(function(anchor){
      var card=ccsCardForDoiAnchor(anchor,doi);if(!card)return;
      Array.from(card.querySelectorAll('img')).forEach(function(image){
        if(!ccsKeyImageSignal(image,card))return;
        articleFigureImageUrls(image,baseUrl||location.href).forEach(function(url,rank){
          if(!url||seen.has(url)||reject('CCS Chemistry key image',url))return;
          seen.add(url);rows.push({url:url,kind:'official',assetType:'toc_graphic',score:980-rank,
            text:'CCS Chemistry key image',source:'ccs_toc_index_key_image',element:null});
        });
      });
    });
    return rows.sort(function(a,b){return b.score-a.score;});
  }
