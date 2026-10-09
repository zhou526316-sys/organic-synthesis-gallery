// Pure public-delivery assertion. The Pages publication builder already binds
// the publisher source/page DOI and image digest before a Figure1-only primary
// can admit body figures. Here we verify the immutable public mirror remains
// internally consistent without reclassifying that Figure 1 as official TOC.
export function liveMediaPrimaryProof(doi, record) {
  const toc=record?.toc;
  if(!toc?.available||!toc?.imageUrl)return {valid:false,kind:'missing'};
  const reason=String(toc.reason||'');
  if(!/fallback/i.test(reason)&&!reason.startsWith('figure_fallback:'))
    return {valid:true,kind:'official'};
  if(!/^10\.(?:1038|1126)\//.test(String(doi||''))
    ||reason!=='figure1_fallback'
    ||toc.sourceRepository!=='Local VPN Collector'
    ||toc.source!=='windows-toc-collector'
    ||!/^[a-f0-9]{32}$/.test(String(toc.contentHash||'')) 
    ||!/^media-mirror\/local-[a-f0-9]+\.(?:png|webp|jpe?g)$/i.test(String(toc.imageUrl||'')))
    return {valid:false,kind:'unverified_fallback'};
  const matches=(record?.figures?.figures||[]).filter(f=>
    f.id==='figure-1' && f.label==='Figure 1'
    && f.contentHash===toc.contentHash && f.imageUrl===toc.imageUrl
    && f.sourceRepository===toc.sourceRepository && f.source===toc.source);
  return matches.length===1
    ? {valid:true,kind:'verified_figure1'}
    : {valid:false,kind:'mismatched_figure1'};
}
