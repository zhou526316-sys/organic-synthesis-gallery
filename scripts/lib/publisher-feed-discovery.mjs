// Independent official publisher feed DOI discovery. This is NOT a claim
// that an RSS feed exhaustively enumerates a publication day or a journal.
// No authentication bypass, article-body scraping, PDF, or OA figure extraction.
const FEEDS = [
  ['Nature','https://www.nature.com/nature.rss','10.1038/s41586-'],
  ['Nature Catalysis','https://www.nature.com/natcatal.rss','10.1038/s41929-'],
  ['Nature Synthesis','https://www.nature.com/natsynth.rss','10.1038/s44160-'],
  ['Nature Chemistry','https://www.nature.com/nchem.rss','10.1038/s41557-'],
  ['Nature Communications','https://www.nature.com/ncomms.rss','10.1038/s41467-'],
  ['JACS','https://pubs.acs.org/rss/jacsat/asap.xml','10.1021/jacs.'],
  ['ACS Catalysis','https://pubs.acs.org/rss/accacs/asap.xml','10.1021/acscatal.'],
  ['Organic Letters','https://pubs.acs.org/rss/orlef7/asap.xml','10.1021/acs.orglett.'],
  ['JOC','https://pubs.acs.org/rss/joceah/asap.xml','10.1021/acs.joc.'],
  ['Angew','https://onlinelibrary.wiley.com/feed/15213773/most-recent','10.1002/anie.'],
  ['Science','https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science','10.1126/science.'],
  ['Science Advances','https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv','10.1126/sciadv.'],
  ['Chem','https://www.cell.com/chem/current.rss','10.1016/j.chempr.'],
  ['CCS Chemistry','https://www.chinesechemsoc.org/action/showFeed?type=etoc&feed=rss&jc=ccschem','10.31635/ccschem.'],
  ['Chemical Science','https://pubs.rsc.org/en/journals/rss?journalcode=sc','10.1039/'],
  ['Green Chemistry','https://pubs.rsc.org/en/journals/rss?journalcode=gc','10.1039/'],
];
// Each publisher route is independently attempted. In particular, CCS and RSC
// may reject automated access; a successful URL guess never counts as full
// publisher completeness. Unreadable or unparseable routes stay explicit gaps.
export const OFFICIAL_PUBLISHER_FEEDS = Object.freeze(FEEDS.map(
  ([journal,url,doiPrefix])=>Object.freeze({journal,url,doiPrefix})
));
const DOI=/10\.\d{4,9}\/[a-z0-9][a-z0-9._;()/:%+-]*/ig;
const norm=value=>String(value||'').trim().toLowerCase()
  .replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'')
  .replace(/[?#].*$/,'').replace(/[.,;:]+$/,'');
function decodeXml(value) {
  return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1')
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,hex,dec)=>{
      const n=parseInt(hex||dec,hex?16:10);
      return Number.isFinite(n)&&n>31&&n<=0x10ffff?String.fromCodePoint(n):' ';
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,name)=>
      ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[name.toLowerCase()])
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function xmlField(item, field) {
  const re=new RegExp('<(?:[a-z0-9_-]+:)?'+field+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?'+field+'\\s*>','i');
  return decodeXml(re.exec(item)?.[1]||'');
}
function identityStrings(item) {
  const values=[];
  for (const tag of ['guid','identifier','doi','link','id']) {
    const re=new RegExp('<(?:[a-z0-9_-]+:)?'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?'+tag+'\\s*>','gi');
    for (const match of item.matchAll(re)) values.push(decodeXml(match[1]));
  }
  // Atom <link href="..."/> identities. Exclude arbitrary description text.
  for (const match of item.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attribute=/(?:^|\s)href\s*=\s*["']([^"']+)["']/i.exec(match[1]);
    if(attribute)values.push(decodeXml(attribute[1]));
  }
  return values;
}
function belongsToFeed(doi,feed) {
  if(!doi.startsWith(feed.doiPrefix))return false;
  // RSC shares the 10.1039/ prefix across all journals. Verify the journal
  // code in the actual DOI, never infer journal from host alone.
  if(feed.journal==='Chemical Science')
    return /^10\.1039\/[a-z]\d{1,2}sc[a-z0-9]+$/i.test(doi);
  if(feed.journal==='Green Chemistry')
    return /^10\.1039\/[a-z]\d{1,2}gc[a-z0-9]+$/i.test(doi);
  return true;
}

function itemIdentity(item, feed) {
  const candidates=[];
  for (const value of identityStrings(item)) {
    for (const match of value.matchAll(DOI)) candidates.push(norm(match[0]));
    // Nature's public RSS sometimes uses a DOI-less article landing URL.
    const nature=/https?:\/\/(?:www\.)?nature\.com\/articles\/(s\d{5}-\d{3}-\d{5}-[a-z0-9]+)/i.exec(value);
    if(nature&&feed.doiPrefix.startsWith('10.1038/'))candidates.push('10.1038/'+nature[1].toLowerCase());
    // RSC RSS identities can use a journal-coded article landing path rather
    // than a DOI URL. The official domain + journal + manuscript code jointly
    // establish a canonical 10.1039 DOI; unrelated references are ignored.
    const rsc=/https?:\/\/(?:www\.)?pubs\.rsc\.org\/(?:en\/)?content\/article(?:landing|html|pdf)\/\d{4}\/(sc|gc)\/([a-z]\d{1,2}(?:sc|gc)[a-z0-9]+)/i.exec(value);
    if(rsc && ((feed.journal==='Chemical Science'&&rsc[1].toLowerCase()==='sc') ||
               (feed.journal==='Green Chemistry'&&rsc[1].toLowerCase()==='gc')))
      candidates.push('10.1039/'+rsc[2].toLowerCase());
  }
  const unique=[...new Set(candidates.filter(doi=>belongsToFeed(doi,feed)))];
  // Multiple identifiers are ambiguous: never guess which DOI is the article.
  if(unique.length!==1)return '';
  return unique[0];
}
function itemDate(item){
  const raw=xmlField(item,'pubDate')||xmlField(item,'published')||
    xmlField(item,'date')||xmlField(item,'updated');
  if(!raw)return '';
  const epoch=Date.parse(raw);
  if(!Number.isFinite(epoch))return '';
  return new Date(epoch).toISOString().slice(0,10);
}
export function parseOfficialPublisherFeed(xml,feed,{startDate='',endDate=''}={}){
  if(!feed||!feed.journal||!feed.doiPrefix||typeof xml!=='string'
    ||!/<(?:rss|feed|rdf:RDF)\b/i.test(xml.slice(0,2500)))
    throw Error('publisher_feed_invalid_xml');
  const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)];
  // A successful 200 with no items is NOT an exhaustive zero-article proof.
  const records=new Map();let unidentifiable=0,outOfRange=0;
  for(const [,item] of items){
    const doi=itemIdentity(item,feed);
    if(!doi){unidentifiable++;continue;}
    const feedDate=itemDate(item);
    if(feedDate && ((startDate&&feedDate<startDate)||(endDate&&feedDate>endDate))){
      outOfRange++;continue;
    }
    if(!records.has(doi))records.set(doi,{
      doi,journal:feed.journal,title:xmlField(item,'title'),
      // A feed date may be issue packaging, not the first online publication.
      // Do not put it into the authoritative publication-date field.
      date:'',feedDate,abstract:'',type:'journal-article',
      authors:[],topics:[],sources:['publisher-feed:'+feed.journal],
      publisherFeedUrl:feed.url,publisherDateUnverified:true
    });
  }
  return {records:[...records.values()],items:items.length,
    unidentifiable,outOfRange,completeListing:false};
}
export async function fetchOfficialPublisherFeeds({startDate='',endDate='',
  fetchImpl=fetch,timeoutMs=9000,maxBytes=2000000,feeds=OFFICIAL_PUBLISHER_FEEDS}={}){
  // Promise.all performs only a small fixed allowlist of independently known
  // public feed URLs. Each fetch has a deadline and must not redirect to IDP.
  const results=await Promise.all(feeds.map(async feed=>{
    try{
      const response=await fetchImpl(feed.url,{
        redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{accept:'application/rss+xml,application/atom+xml,text/xml,application/xml;q=0.9',
          'user-agent':'OrganicSynthesisGallery-PublisherFeedAudit/1.0'}
      });
      if(!response.ok)throw Error('http_'+response.status);
      const type=String(response.headers.get('content-type')||'').toLowerCase();
      if(type&&!/(?:xml|rss|atom)/i.test(type))throw Error('not_xml');
      const length=Number(response.headers.get('content-length')||'0');
      if(length>maxBytes)throw Error('feed_oversize');
      const xml=await response.text();
      if(xml.length>maxBytes)throw Error('feed_oversize');
      const parsed=parseOfficialPublisherFeed(xml,feed,{startDate,endDate});
      return {journal:feed.journal,url:feed.url,status:'reachable_partial',
        ...parsed,error:''};
    }catch(error){
      return {journal:feed.journal,url:feed.url,status:'blocked_or_unavailable',
        completeListing:false,records:[],items:0,unidentifiable:0,
        outOfRange:0,error:String(error?.message||error).slice(0,180)};
    }
  }));
  const attempted=new Set(results.map(row=>row.journal));
  return {
    candidates:results.flatMap(row=>row.records),
    status:results.map(({records,...fields})=>({...fields,doiCount:records.length})),
    unavailable:[],
    notConfigured:[],attempted,
  };
}
