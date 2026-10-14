// Authorized read-only production coverage preflight for DOI-bound scientific FTS.
// Never logs or persists the Bearer token, any article text, or private media.
import {writeFile} from 'node:fs/promises';
const endpoint='https://api.gczhouwld.com/api/admin/literature-body-sections/coverage';
const releaseUrl='https://gallery.gczhouwld.com/release-delivery.json';
const output=process.argv.find(x=>x.startsWith('--output='))?.slice('--output='.length)
  ||'/tmp/verified-body-live-coverage.json';
const result={schemaVersion:1,readOnly:true,checkedAt:new Date().toISOString(),
  runId:process.env.GITHUB_RUN_ID||null,formalCatalogId:null,formalDois:null,
  adminAuthConfigured:Boolean(process.env.BRIDGE_WRITE_TOKEN),
  endpoint:'GET /api/admin/literature-body-sections/coverage',
  endpointResponse:'not_checked',verifiedDoi:null,verifiedSections:null,
  publicEnabled:null,rawTextRetained:false,privateCredentialsLogged:false};
try{
  const releaseResponse=await fetch(releaseUrl,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!releaseResponse.ok)throw Error('release_http_'+releaseResponse.status);
  const release=await releaseResponse.json();
  if(!/^[a-f0-9]{64}$/.test(String(release.architectureCatalogId||''))||
     !Array.isArray(release.dois)||release.dois.length!==release.productionCards)
    throw Error('release_identity_invalid');
  result.formalCatalogId=release.architectureCatalogId;
  result.formalDois=release.productionCards;
  if(!process.env.BRIDGE_WRITE_TOKEN)result.endpointResponse='admin_secret_unconfigured';
  else{
    const url=endpoint+'?catalogId='+encodeURIComponent(release.architectureCatalogId);
    const response=await fetch(url,{method:'GET',redirect:'error',
      headers:{accept:'application/json',authorization:'Bearer '+process.env.BRIDGE_WRITE_TOKEN},
      signal:AbortSignal.timeout(15000)});
    const raw=(await response.text()).slice(0,1000);
    let parsed={};try{parsed=JSON.parse(raw);}catch{ /* do not propagate raw response */ }
    if(response.status===200){
      if(parsed.catalogId!==release.architectureCatalogId||
         !Number.isSafeInteger(parsed.verifiedDoi)||
         !Number.isSafeInteger(parsed.verifiedSections)||
         typeof parsed.publicEnabled!=='boolean')throw Error('coverage_schema_or_catalog_invalid');
      result.endpointResponse='ok';
      result.verifiedDoi=parsed.verifiedDoi;
      result.verifiedSections=parsed.verifiedSections;
      result.publicEnabled=parsed.publicEnabled;
    }else{
      const known=['body_index_db_unavailable','body_invalid_catalog','unauthorized',
        'invalid_token','missing_authorization'];
      result.endpointResponse='http_'+response.status;
      result.errorCode=known.includes(String(parsed.error||''))?parsed.error:'unknown_or_unsupported_response';
    }
  }
}catch(e){
  const msg=String(e?.message||e);
  result.endpointResponse='error';
  result.errorCode=/^release_http_\d+$/.test(msg)?msg:
    ['release_identity_invalid','coverage_schema_or_catalog_invalid'].includes(msg)?msg:
      'network_or_provider_unavailable';
}
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log('VERIFIED_BODY_LIVE_COVERAGE '+JSON.stringify(result));
