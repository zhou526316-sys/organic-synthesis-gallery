import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_PUBLISHER_FEEDS,parseOfficialPublisherFeed,fetchOfficialPublisherFeeds}
  from './lib/publisher-feed-discovery.mjs';

const ol=OFFICIAL_PUBLISHER_FEEDS.find(feed=>feed.journal==='Organic Letters');
const ns=OFFICIAL_PUBLISHER_FEEDS.find(feed=>feed.journal==='Nature Synthesis');
test('official feed registry preserves independent RSS paths without pretending all 16 are accessible',()=>{
  assert.ok(OFFICIAL_PUBLISHER_FEEDS.length>=12);
  assert.equal(ol.url,'https://pubs.acs.org/rss/orlef7/asap.xml');
  assert.equal(ns.doiPrefix,'10.1038/s44160-');
  assert.equal(OFFICIAL_PUBLISHER_FEEDS.length,16);
  assert.ok(OFFICIAL_PUBLISHER_FEEDS.some(x=>x.journal==='Green Chemistry'));
  assert.ok(OFFICIAL_PUBLISHER_FEEDS.some(x=>x.journal==='Chemical Science'));
  assert.ok(OFFICIAL_PUBLISHER_FEEDS.some(x=>x.journal==='CCS Chemistry'));
});
test('ACS publisher feed discovers missing DOI without treating an unrelated abstract citation as item identity',()=>{
  const xml='<rss><channel>'+
  '<item><title>Direct Enantioselective Alpha Alkoxylation</title>'+
  '<guid>https://pubs.acs.org/doi/10.1021/acs.orglett.6c04095</guid>'+
  '<pubDate>Mon, 12 Oct 2026 07:50:00 GMT</pubDate>'+
  '<description>A published reference doi:10.1021/acs.orglett.6c00001</description></item>'+
  '<item><title>Off-journal paper</title><guid>https://doi.org/10.1021/jacs.6c15216</guid></item></channel></rss>';
  const p=parseOfficialPublisherFeed(xml,ol,{startDate:'2026-10-10',endDate:'2026-10-13'});
  assert.equal(p.items,2);
  assert.deepEqual(p.records.map(r=>r.doi),['10.1021/acs.orglett.6c04095']);
  assert.equal(p.records[0].date,'');
  assert.equal(p.records[0].feedDate,'2026-10-12');
  assert.equal(p.records[0].publisherDateUnverified,true);
  assert.equal(p.completeListing,false);
  assert.equal(p.unidentifiable,1);
});
test('recover the exact Nature Synthesis missed DOI from public article RSS identity',()=>{
  const xml='<rss><channel><item>'+
    '<title>One-step skeletal editing of oxetanes to thietanes using thiourea</title>'+
    '<guid>https://www.nature.com/articles/s44160-026-01189-z</guid>'+
    '<pubDate>Mon, 12 Oct 2026 02:00:00 GMT</pubDate>'+
    '</item></channel></rss>';
  const p=parseOfficialPublisherFeed(xml,ns,{startDate:'2026-10-11',endDate:'2026-10-13'});
  assert.equal(p.records[0].doi,'10.1038/s44160-026-01189-z');
  assert.equal(p.records[0].sources[0],'publisher-feed:Nature Synthesis');
  assert.equal(p.records[0].date,'');
});
test('RSC feed DOI identity must contain its own journal-specific DOI code',()=>{
  const sc=OFFICIAL_PUBLISHER_FEEDS.find(feed=>feed.journal==='Chemical Science');
  const gc=OFFICIAL_PUBLISHER_FEEDS.find(feed=>feed.journal==='Green Chemistry');
  const xml='<rss><channel>'+
    '<item><guid>https://doi.org/10.1039/d6sc06521a</guid></item>'+
    '<item><guid>https://doi.org/10.1039/d6gc03891b</guid></item></channel></rss>';
  assert.deepEqual(parseOfficialPublisherFeed(xml,sc).records.map(x=>x.doi),['10.1039/d6sc06521a']);
  assert.deepEqual(parseOfficialPublisherFeed(xml,gc).records.map(x=>x.doi),['10.1039/d6gc03891b']);
});

test('do not select an ambiguous multi-DOI identity or silently drop XML access failures',async()=>{
  const xml='<rss><channel><item><guid>doi:10.1021/acs.orglett.6c04095</guid>'+
    '<dc:identifier>doi:10.1021/acs.orglett.6c04010</dc:identifier>'+
    '</item></channel></rss>';
  assert.equal(parseOfficialPublisherFeed(xml,ol).records.length,0);
  const results=await fetchOfficialPublisherFeeds({
    feeds:[ol,ns],startDate:'2026-10-11',endDate:'2026-10-13',
    fetchImpl:async url=>{
      if(url===ol.url)return new Response('<html>CAPTCHA</html>',{
        status:200,headers:{'content-type':'text/html'}});
      return new Response('blocked',{status:403,headers:{'content-type':'text/xml'}});
    }
  });
  assert.deepEqual(results.candidates,[]);
  assert.equal(results.status.length,2);
  assert.equal(results.status.every(x=>x.status==='blocked_or_unavailable'),true);
  assert.equal(results.status.every(x=>x.completeListing===false),true);
});
test('feed containing only old or repackaged entries does not establish no-article day',()=>{
  const xml='<rss><channel><item><guid>doi:10.1021/acs.orglett.6c03971</guid>'+
    '<pubDate>Sat, 10 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
  const p=parseOfficialPublisherFeed(xml,ol,{startDate:'2026-10-12',endDate:'2026-10-13'});
  assert.equal(p.records.length,0);
  assert.equal(p.outOfRange,1);
  assert.equal(p.completeListing,false);
});
