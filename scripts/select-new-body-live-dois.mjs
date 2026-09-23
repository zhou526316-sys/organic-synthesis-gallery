export function selectLiveVerificationBatch(status, snapshot) {
  const addedDois=[...new Set((status?.added||[]).map(x=>String(x?.doi||'').trim()).filter(Boolean))];
  if(addedDois.length)return {mode:'current_release',dois:addedDois,admittedAt:null};
  const items=Array.isArray(snapshot?.items)?snapshot.items:[];
  let latest=0;
  for(const item of items){
    const at=Number(item?.admittedAt||0);
    if(Number.isFinite(at)&&at>latest)latest=at;
  }
  if(!latest)return {mode:'none',dois:[],admittedAt:null};
  const dois=[...new Set(items.filter(x=>Number(x?.admittedAt||0)===latest).map(x=>String(x?.record?.doi||'').trim()).filter(Boolean))];
  return {mode:dois.length?'latest_retained_release':'none',dois,admittedAt:dois.length?latest:null};
}
