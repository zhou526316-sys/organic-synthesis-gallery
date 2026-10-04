  // Only a visibly numbered heading within this figure may recover a missing
  // caption label. No filename-number guessing and no shared-article captions.
  function wileyBodyFigureContext(node, original) {
    if (!node || !node.closest || original && (original.label || original.official)) return original;
    if (node.closest('aside,nav,header,footer,[class*="recommend" i],[class*="related" i],[id*="related" i],[class*="reference" i]')) return null;
    var block=original&&original.block || node.closest('figure,[role="figure"],.article-section__figure');
    if(!block || !block.contains(node))return null;
    var captions=Array.from(block.querySelectorAll('figcaption,.caption,[class*="caption"],.figure-title,.figure__title,[role="heading"],h1,h2,h3,h4,h5,h6'));
    [node,block].forEach(function(el){
      ['aria-labelledby','aria-describedby'].forEach(function(attr){
        String(el.getAttribute(attr)||'').split(/\s+/).filter(Boolean).forEach(function(id){
          var target=el.ownerDocument.getElementById(id);
          if(target&&block.contains(target)&&captions.indexOf(target)<0)captions.push(target);
        });
      });
    });
    var texts=captions.map(function(c){return String(c.textContent||'').replace(/\s+/g,' ').trim();}).filter(Boolean);
    var own=[node.getAttribute('alt'),node.getAttribute('title'),node.getAttribute('aria-label')].filter(Boolean).join(' ');
    var numbered=texts.concat(own).filter(function(t){return /^(?:Fig(?:ure)?\.?|Scheme|Chart)\s*\d+[a-z]?\b/i.test(t);});
    var labels=Array.from(new Set(numbered.map(function(t){return articleFigureLabel(t,0);})));
    if(labels.length!==1)return null;
    var descendants=Array.from(block.querySelectorAll('figure,[role="figure"],.article-section__figure'));
    if(descendants.some(function(other){return other!==block&&!other.contains(node);}))return null;
    return {block:block,label:labels[0],caption:(numbered[0]+' '+texts.filter(function(t){return t!==numbered[0];}).join(' ')).slice(0,600),official:false};
  }

  function orderedFigureCandidates(job,candidates,role) {
    if(job.publisher!=='acs'||role!=='figure')return candidates.slice(0,4);
    // These are all links already supplied by the same isolated figure DOM.
    // Prefer real vector files before HTML viewers and preview raster variants.
    var unique=[],seen=new Set();
    candidates.forEach(function(c){if(c&&c.url&&!seen.has(c.url)){seen.add(c.url);unique.push(c);}});
    return unique.map(function(c,i){return {c:c,i:i,vector:/\.svg(?:[?#]|$)/i.test(c.url)&&!isAcsImageViewerUrl(c.url)};})
      .sort(function(a,b){return Number(b.vector)-Number(a.vector)||a.i-b.i;})
      .slice(0,6).map(function(x){return x.c;});
  }
