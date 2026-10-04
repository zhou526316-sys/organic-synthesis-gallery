// Read every page of one immutable logical snapshot; never silently accept a prefix.
export async function readPublicationPages(url, kind, fetchBytes) {
  const limit=250, maxBytes=64000000, maxItems=20000;
  function require(ok, code) { if (!ok) throw new Error(code); }
  for (let attempt=0;attempt<3;attempt++) {
    let bytes=0;
    try {
      async function page(offset, snapshot='') {
        const u=new URL(url);u.searchParams.set('publication','1');u.searchParams.set('limit',String(limit));u.searchParams.set('offset',String(offset));
        if(snapshot)u.searchParams.set('snapshot',snapshot);
        const raw=await fetchBytes(u.href);bytes+=raw.length;require(bytes<=maxBytes,'auto_publication_metadata_size_limit');
        const p=JSON.parse(raw);
        require(p.schemaVersion==='stored-publication-page-v1'&&p.kind===kind&&p.mediaGeneration===1790082000000,'auto_publication_schema_invalid');
        require(/^[a-f0-9]{64}$/.test(p.snapshot)&&(!snapshot||p.snapshot===snapshot),'auto_publication_snapshot_mismatch');
        require(Number.isSafeInteger(p.count)&&p.count>=0&&p.count<=maxItems&&p.offset===offset&&p.limit===limit&&Array.isArray(p.items),'auto_publication_page_invalid');
        require(p.items.length===Math.min(limit,p.count-offset)&&p.nextOffset===(offset+p.items.length<p.count?offset+p.items.length:null),'auto_publication_page_truncated');
        return p;
      }
      const first=await page(0), all=[first];
      const offsets=[];for(let n=limit;n<first.count;n+=limit)offsets.push(n);
      for(let i=0;i<offsets.length;i+=4){
        const chunk=await Promise.all(offsets.slice(i,i+4).map(n=>page(n,first.snapshot)));
        require(chunk.every(p=>p.count===first.count),'auto_publication_count_changed');all.push(...chunk);
      }
      const items=all.flatMap(p=>p.items);
      const keys=items.map(r=>kind==='stage'?r.doi+'|'+r.id:r.doi);
      require(items.length===first.count&&new Set(keys).size===items.length,'auto_publication_duplicate_or_missing');
      return {count:items.length,items,snapshot:first.snapshot,schemaVersion:first.schemaVersion};
    } catch(e) {
      if(attempt<2&&/auto_read_http_409|publication_snapshot_changed/.test(String(e.message)))continue;
      throw e;
    }
  }
  throw new Error('auto_publication_snapshot_unstable');
}
