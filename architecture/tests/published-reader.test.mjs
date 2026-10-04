import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCatalog, stable } from '../catalog.mjs';
import { PublishedCatalogClient } from '../published-reader.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const ref = (path, text) => ({ path, sha256: sha256(text), bytes: Buffer.byteLength(text) });
const sourceCommit = 'a'.repeat(40);
const datasetSha256 = 'b'.repeat(64);
const publicationSlot = '2026-10-04T08:00:00+08:00';
const papers = [
  { doi:'10.1234/archive', title:'Archive nickel chemistry', titleZh:'历史镍化学', journal:'JACS', authors:['A'], date:'2026-07-01', url:'https://doi.org/10.1234/archive', new:false, addedDate:'2026-07-01' },
  { doi:'10.1234/hot', title:'Hot photoredox chemistry', titleZh:'近期光氧化还原化学', journal:'Angew', authors:['B'], date:'2026-10-03', url:'https://doi.org/10.1234/hot', new:true, addedDate:'2026-10-04' },
];

function fixture({ corruptRelease = false, active = true } = {}) {
  const bundle = buildCatalog(papers, {
    asOfDate:'2026-10-04',
    source:{ commit:sourceCommit, datasetSha256, publicationSlot, markerBlobSha:'c'.repeat(40), parityBasis:'fixture' },
  });
  const generated = { ...bundle.files };
  const currentText = generated['current.json'];
  const currentRef = ref('current.json', currentText);
  const members = Object.fromEntries(bundle.records.map(row => [row.doi, row.revision]));
  const membershipBody = {
    schema:'gallery-published-membership-v1', scope:'all-time', complete:true,
    publicationSlot, sourceCommit, markerBlobSha:'c'.repeat(40),
    catalogId:bundle.catalog.recordSetHash, doiSetHash:bundle.catalog.doiSetHash,
    serial:Date.parse(publicationSlot), count:bundle.records.length, members, withdrawn:[],
  };
  const membershipText = stable(membershipBody)+'\n';
  const membershipRef = ref(`membership.${sha256(membershipText)}.json`, membershipText);
  generated[membershipRef.path] = membershipText;
  const objects = Object.entries(generated).map(([path,text]) => ref(path,text)).sort((a,b)=>a.path.localeCompare(b.path));
  const release = {
    schema:'gallery-architecture-public-v1', productionActivation:false, frontendReadActivation:active,
    publicationSlot, sourceCommit, markerBlobSha:'c'.repeat(40), datasetSha256,
    asOfDate:'2026-10-04', recordCount:bundle.records.length, catalogId:bundle.catalog.recordSetHash,
    doiSetHash:bundle.catalog.doiSetHash, catalogCurrent:currentRef, membership:membershipRef,
    titlePresentation:ref('title.fixture.json', stable({schema:'x'})+'\n'), objects,
  };
  const releaseText = stable(release)+'\n';
  const architectureObjects = Object.fromEntries(objects.map(row=>['architecture-v1/'+row.path,row.sha256]));
  const delivery = {
    schemaVersion:2, sourceCommit, markerBlobSha:'c'.repeat(40), publicationSlot,
    productionCards:papers.length, datasetSha256, dois:bundle.records.map(row=>row.doi),
    files:{'architecture-v1/release.json':corruptRelease?'0'.repeat(64):sha256(releaseText)},
    architectureObjects, architectureCatalogId:bundle.catalog.recordSetHash,
  };
  const map = new Map([
    ['/release-delivery.json', JSON.stringify(delivery)],
    ['/architecture-v1/release.json', releaseText],
    ...Object.entries(generated).map(([path,text])=>['/architecture-v1/'+path,text]),
  ]);
  const fetcher = async url => {
    const u = new URL(url);
    const body = map.get(u.pathname);
    return new Response(body ?? 'not found', {
      status: body === undefined ? 404 : 200,
      headers:{ date:'Sun, 04 Oct 2026 00:20:00 GMT', 'content-type':'application/json' },
    });
  };
  return { fetcher };
}

test('verified frontend reader loads Hot only by default and preserves all-time membership', async () => {
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture()).open();
  assert.deepEqual(client.memberDois, ['10.1234/archive','10.1234/hot']);
  const landing = await client.landing();
  assert.deepEqual(landing.map(row=>row.doi), ['10.1234/hot']);
});

test('Archive deep-link resolves without loading all history into landing', async () => {
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture()).open();
  const landing = await client.landing('10.1234/archive');
  assert.deepEqual(landing.map(row=>row.doi), ['10.1234/archive','10.1234/hot']);
});

test('global search resolves Archive records on demand', async () => {
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture()).open();
  const rows = await client.search('Archive nickel');
  assert.deepEqual(rows.map(row=>row.doi), ['10.1234/archive']);
});

test('date range resolves Archive records on demand', async () => {
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture()).open();
  const rows = await client.range('2026-07-01','2026-07-31');
  assert.deepEqual(rows.map(row=>row.doi), ['10.1234/archive']);
});

test('delivery/release hash mismatch fails closed', async () => {
  await assert.rejects(
    new PublishedCatalogClient('https://example.invalid/', fixture({corruptRelease:true})).open(),
    /architecture_release_hash_mismatch/
  );
});

test('frontend reader requires explicit frontend-only activation', async () => {
  await assert.rejects(
    new PublishedCatalogClient('https://example.invalid/', fixture({active:false})).open(),
    /frontend_architecture_not_active/
  );
});
