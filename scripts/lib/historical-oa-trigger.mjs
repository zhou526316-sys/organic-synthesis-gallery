// Read-only OA source scan trigger. A source window never imports article text.
const HASH=/^[a-f0-9]{64}$/;
const REQUEST=/^[a-z0-9][a-z0-9_-]{5,90}$/i;
export function normalizeOaTrigger(value){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).some(key=>!['schemaVersion','requestId','catalogId','offset','limit','purpose'].includes(key)))
    throw Error('historical_oa_trigger_fields_invalid');
  const {schemaVersion,requestId,catalogId,offset,limit}=value;
  if(schemaVersion!==1||!REQUEST.test(String(requestId||''))||!HASH.test(String(catalogId||''))
    ||!Number.isSafeInteger(offset)||offset<0||offset>100000
    ||!Number.isSafeInteger(limit)||limit<1||limit>20)
    throw Error('historical_oa_trigger_identity_invalid');
  return {requestId,catalogId,offset,limit};
}
