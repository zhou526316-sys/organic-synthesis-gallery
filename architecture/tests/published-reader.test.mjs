import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCatalog, stable } from '../catalog.mjs';
import { PublishedCatalogClient, loadPublishedHotFallback } from '../published-reader.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const ref = (path, text) => ({ path, sha256: sha256(text), bytes: Buffer.byteLength(text) });
const sourceCommit = 'a'.repeat(40);
const datasetSha256 = 'b'.repeat(64);
const publicationSlot = '2026-10-04T08:00:00+08:00';
const papers = [
  { doi:'10.1234/archive', title:'Archive nickel chemistry', titleZh:'历史镍化学', journal:'JACS', authors:['A'], date:'2026-07-01', url:'https://doi.org/10.1234/archive', new:false, addedDate:'2026-07-01' },
  { doi:'10.1234/hot', title:'Hot photoredox chemistry', titleZh:'近期光氧化还原化学', journal:'Angew', authors:['B'], date:'2026-10-03', url:'https://doi.org/10.1234/hot', new:true, addedDate:'2026-10-04' },
];

function fixture({ corruptRelease = false, active = true, badMembership = false, wrongGeneration = false, sourcePapers = papers } = {}) {
  const bundle = buildCatalog(sourcePapers, {
    asOfDate:'2026-10-04',
    source:{ commit:sourceCommit, datasetSha256, publicationSlot, markerBlobSha:'c'.repeat(40), parityBasis:'fixture' },
  });
  const generated = { ...bundle.files };
  const currentText = generated['current.json'];
  const currentRef = ref('current.json', currentText);
  const members = Object.fromEntries(bundle.records.map(row => [row.doi, row.revision]));
  const membershipBody = {
    schema:'gallery-published-membership-v1', scope:badMembership ? 'partial' : 'all-time', complete:true,
    publicationSlot, sourceCommit, markerBlobSha:'c'.repeat(40),
    catalogId:bundle.catalog.recordSetHash, doiSetHash:bundle.catalog.doiSetHash,
    serial:Date.parse(publicationSlot), count:bundle.records.length, members, withdrawn:[],
  };
  const membershipText = stable(membershipBody)+'\n';
  const membershipRef = ref(`membership.${sha256(membershipText)}.json`, membershipText);
  generated[membershipRef.path] = membershipText;
  const hotFallbackBody = {
    schema:'gallery-hot-fallback-v1', catalogId:bundle.catalog.recordSetHash, doiSetHash:bundle.catalog.doiSetHash,
    publicationSlot, sourceCommit, generatedAsOfDate:'2026-10-04', scope:'hot-plus-future-candidates',
    count:bundle.partitions.hot.length,
    records:bundle.records.filter(row => bundle.partitions.hot.includes(row.doi)),
  };
  const hotFallbackText = stable(hotFallbackBody)+'\n';
  const hotFallbackRef = ref(`hot-fallback.${sha256(hotFallbackText)}.json`, hotFallbackText);
  generated[hotFallbackRef.path] = hotFallbackText;
  const hotRows = bundle.records.filter(row => bundle.partitions.hot.includes(row.doi));
  const hotHeadBody = {
    schema:'gallery-hot-head-v1', catalogId:bundle.catalog.recordSetHash, doiSetHash:bundle.catalog.doiSetHash,
    publicationSlot, sourceCommit, generatedAsOfDate:'2026-10-04', scope:'hot-plus-future-candidates',
    pageSize:24, candidateCount:hotRows.length,
    dateBuckets:[{ firstOnlineDate:'2026-10-03', datePrecision:'day', count:hotRows.length }],
    count:hotRows.length, records:hotRows,
  };
  const hotHeadText = stable(hotHeadBody)+'\n';
  const hotHeadRef = ref(`hot-head.${sha256(hotHeadText)}.json`, hotHeadText);
  generated[hotHeadRef.path] = hotHeadText;
  const objects = Object.entries(generated).map(([path,text]) => ref(path,text)).sort((a,b)=>a.path.localeCompare(b.path));
  const release = {
    schema:'gallery-architecture-public-v1', productionActivation:false, frontendReadActivation:active,
    publicationSlot, sourceCommit, markerBlobSha:'c'.repeat(40), datasetSha256,
    asOfDate:'2026-10-04', recordCount:bundle.records.length, catalogId:bundle.catalog.recordSetHash,
    doiSetHash:bundle.catalog.doiSetHash, catalogCurrent:currentRef, membership:membershipRef,
    hotFallback:hotFallbackRef, hotHead:hotHeadRef, hotHeadInline:hotHeadBody,
    titlePresentation:ref('title.fixture.json', stable({schema:'x'})+'\n'), objects,
  };
  const releaseText = stable(release)+'\n';
  const architectureObjects = Object.fromEntries(objects.map(row=>['architecture-v1/'+row.path,row.sha256]));
  const delivery = {
    schemaVersion:2, sourceCommit:wrongGeneration ? 'd'.repeat(40) : sourceCommit, markerBlobSha:'c'.repeat(40), publicationSlot,
    productionCards:sourcePapers.length, datasetSha256, dois:bundle.records.map(row=>row.doi),
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
  return { fetcher, map };
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

test('indexed discovery resolves only revision-bound content records', async () => {
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture()).open();
  assert.equal(client.catalogId.length, 64);
  const revision = client.membership.members['10.1234/archive'];
  const rows = await client.resolveIndexed([{ doi:'10.1234/archive', revision }]);
  assert.deepEqual(rows.map(row => row.doi), ['10.1234/archive']);
  await assert.rejects(
    client.resolveIndexed([{ doi:'10.1234/archive', revision:'f'.repeat(64) }]),
    /indexed_membership_revision_mismatch/
  );
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


test('bounded Hot head uses the release-inline payload without a second object request', async () => {
  const source = fixture();
  const requests = [];
  const fetcher = async url => {
    requests.push(new URL(url).pathname);
    return source.fetcher(url);
  };
  const fallback = await loadPublishedHotFallback('https://example.invalid/', { fetcher, headOnly:true });
  assert.equal(fallback.headOnly, true);
  assert.deepEqual(fallback.papers.map(row => row.doi), ['10.1234/hot']);
  assert.equal(requests.some(path => /\/architecture-v1\/hot-head\./.test(path)), false);
  assert.deepEqual(requests.slice(0,2).sort(), ['/architecture-v1/release.json','/release-delivery.json'].sort());
});

test('bounded Hot fallback survives an all-time membership validation failure without loading Archive', async () => {
  const source = fixture({ badMembership:true });
  await assert.rejects(
    new PublishedCatalogClient('https://example.invalid/', source).open(),
    /published_membership_invalid/
  );
  const fallback = await loadPublishedHotFallback('https://example.invalid/', source);
  assert.equal(fallback.mode, 'architecture-hot-fallback');
  assert.deepEqual(fallback.papers.map(row => row.doi), ['10.1234/hot']);
  assert.equal(fallback.catalogId.length, 64);
});

test('Hot fallback still requires a release-delivery hash binding', async () => {
  await assert.rejects(
    loadPublishedHotFallback('https://example.invalid/', fixture({ corruptRelease:true })),
    /architecture_release_hash_mismatch/
  );
});


test('static Archive fallback refuses silent result truncation', async () => {
  const sourcePapers = Array.from({ length: 1001 }, (_, index) => ({
    doi:`10.1234/overflow-${String(index).padStart(4,'0')}`,
    title:'Overflow nickel chemistry',
    titleZh:'溢出镍化学',
    journal:'JACS',
    authors:['A'],
    date:'2026-07-01',
    url:`https://doi.org/10.1234/overflow-${String(index).padStart(4,'0')}`,
    new:false,
    addedDate:'2026-07-01',
  }));
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture({ sourcePapers })).open();
  await assert.rejects(client.search('Overflow nickel'), /global_search_result_window_required/);
  await assert.rejects(client.range('2026-07-01','2026-07-31'), /date_range_result_window_required/);
});

test('static Archive fallback refuses corpus-wide fanout after 36 monthly segments', async () => {
  const sourcePapers = Array.from({ length: 37 }, (_, index) => {
    const date = new Date(Date.UTC(2023, 9 + index, 1)).toISOString().slice(0,10);
    return {
      doi:`10.1234/fanout-${String(index).padStart(2,'0')}`,
      title:'Fanout chemistry',
      titleZh:'扇出化学',
      journal:'JACS',
      authors:['A'],
      date,
      url:`https://doi.org/10.1234/fanout-${String(index).padStart(2,'0')}`,
      new:false,
      addedDate:date,
    };
  });
  const client = await new PublishedCatalogClient('https://example.invalid/', fixture({ sourcePapers })).open();
  await assert.rejects(client.search('Fanout chemistry'), /global_search_fanout_window_required/);
  await assert.rejects(client.range('2023-10-01','2026-10-04'), /date_range_fanout_window_required/);
});

function trackedFetch(fetchImpl) {
  const requests = [];
  return {
    requests,
    async fetcher(url, init = {}) {
      const u = new URL(url);
      requests.push({ pathname:u.pathname, nonce:u.searchParams.get('gallery_pair_retry'), cache:init.cache });
      return fetchImpl(url, init);
    },
  };
}

const pairEntries = [
  ['full published reader', async fetcher => new PublishedCatalogClient('https://example.invalid/', { fetcher }).open()],
  ['bounded Hot head', async fetcher => loadPublishedHotFallback('https://example.invalid/', { fetcher, headOnly:true })],
];
function pairRequests(requests) {
  return requests.filter(row => row.pathname === '/release-delivery.json'
    || row.pathname === '/architecture-v1/release.json');
}

for (const [name, open] of pairEntries) {
  test(name + ' performs one verified pair only when manifests match', async () => {
    const fixtureGood = fixture();
    const tracker = trackedFetch(fixtureGood.fetcher);
    const reader = await open(tracker.fetcher);
    assert.ok(reader);
    const reads = pairRequests(tracker.requests);
    assert.equal(reads.length, 2);
    assert.ok(reads.every(row => row.nonce === null && row.cache === 'no-store'));
  });

  test(name + ' recovers one transient release digest mismatch by rereading both manifests', async () => {
    const good = fixture();
    const stale = fixture({ corruptRelease:true });
    const tracker = trackedFetch(url => {
      const u = new URL(url);
      return u.pathname === '/release-delivery.json' && !u.search
        ? stale.fetcher(url) : good.fetcher(url);
    });
    const output = await open(tracker.fetcher);
    assert.ok(output);
    const reads = pairRequests(tracker.requests);
    assert.equal(reads.length, 4, 'initial pair and one complete reread');
    const secondPair = reads.slice(2);
    assert.ok(secondPair.every(row => row.nonce && row.cache === 'reload'));
    assert.equal(secondPair[0].nonce, secondPair[1].nonce, 'pair must bypass edge cache together');
  });

  test(name + ' tolerates at most two hash rechecks and requires a fresh matching pair', async () => {
    const good = fixture(), stale = fixture({ corruptRelease:true });
    const tracker = trackedFetch(url => {
      const u = new URL(url);
      const nonce = u.searchParams.get('gallery_pair_retry');
      const wrong = !nonce || nonce.endsWith('-1');
      return u.pathname === '/release-delivery.json' && wrong
        ? stale.fetcher(url) : good.fetcher(url);
    });
    const output = await open(tracker.fetcher);
    assert.ok(output);
    const reads = pairRequests(tracker.requests);
    assert.equal(reads.length, 6);
    assert.equal(new Set(reads.filter(row => row.nonce).map(row => row.nonce)).size, 2);
  });

  test(name + ' fails closed after three permanently mismatched pair reads', async () => {
    const bad = fixture({ corruptRelease:true });
    const tracker = trackedFetch(bad.fetcher);
    await assert.rejects(open(tracker.fetcher), /architecture_release_hash_mismatch/);
    const reads = pairRequests(tracker.requests);
    assert.equal(reads.length, 6, 'no fourth or unbounded retry is allowed');
    assert.ok(reads.slice(2).every(row => row.cache === 'reload' && row.nonce));
    assert.equal(new Set(reads.slice(2).map(row => row.nonce)).size, 2);
    assert.equal(tracker.requests.length, 6, 'invalid manifest cannot authorize any architecture object');
  });

  test(name + ' recovers a transient hash-bound generation mismatch with the same pair protocol', async () => {
    const good = fixture(), stale = fixture({ wrongGeneration:true });
    const tracker = trackedFetch(url => {
      const u = new URL(url);
      return u.pathname === '/release-delivery.json' && !u.search
        ? stale.fetcher(url) : good.fetcher(url);
    });
    const result = await open(tracker.fetcher);
    assert.ok(result);
    assert.equal(pairRequests(tracker.requests).length, 4);
  });

  test(name + ' does not retry unrelated invalid frontend activation', async () => {
    const inactive = fixture({ active:false });
    const tracker = trackedFetch(inactive.fetcher);
    await assert.rejects(open(tracker.fetcher), /frontend_architecture_not_active/);
    assert.equal(pairRequests(tracker.requests).length, 2);
  });
}

test('aborting during the first failed release pair prevents any retry', async () => {
  const bad = fixture({ corruptRelease:true });
  const tracker = trackedFetch(bad.fetcher);
  const abort = new AbortController();
  const task = new PublishedCatalogClient('https://example.invalid/', { fetcher:tracker.fetcher }).open(abort.signal);
  setTimeout(() => abort.abort(new Error('release_pair_test_cancelled')), 35);
  await assert.rejects(task, /release_pair_test_cancelled/);
  assert.equal(pairRequests(tracker.requests).length, 2);
});
