import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILES, collectPapers, assertPartition, sameSet, markerPublicationSlot } from './pages-release-delivery.mjs';
import { buildCatalog, verifyCatalog, stable, digest } from '../architecture/catalog.mjs';
import { buildLegacyTitlePresentation } from '../architecture/title-presentation.mjs';
import { loadScopeCorrections } from './lib/scope-corrections.mjs';
import { isExcludedDoi } from '../shared/literature-policy.js';
import { beijingDate } from '../shared/literature-lifecycle.mjs';
import { isHotLandingEligible, hotLandingSortDate } from '../shared/literature-landing.mjs';
import { RESULT_WINDOW_SIZE } from '../shared/result-window.js';

const ROOT = process.cwd();
const PUBLIC = path.resolve(ROOT, 'public');
const OUTPUT = path.resolve(ROOT, process.env.GALLERY_ARCHITECTURE_PUBLIC_OUT || 'public/architecture-v1');
const MARKER_FILE = 'audit/publication-release-state.json';
const SOURCE_FILES = [...DATA_FILES, 'literature-supplement.json'];
const TITLE_PRECEDENCE = ['papers.gz.b64','total-synthesis.json','manual-supplement.json','final-audit-supplement.json','literature-supplement.json'];
const SCHEMA = 'gallery-architecture-public-v1';
const MEMBERSHIP_SCHEMA = 'gallery-published-membership-v1';
const RETIRED_LAST_EVENING_SLOT = '2026-10-04T18:00:00+08:00';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding:'utf8', maxBuffer:64*1024*1024 }).trim();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blobSha = value => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');
const json = async file => JSON.parse(await readFile(path.resolve(ROOT, file), 'utf8'));

function parsePapers(name, text) {
  const payload = JSON.parse(name === 'papers.gz.b64'
    ? gunzipSync(Buffer.from(text.trim(), 'base64')).toString('utf8')
    : text);
  const rows = Array.isArray(payload) ? payload : payload?.papers;
  assert(Array.isArray(rows), `paper_array_missing:${name}`);
  return rows;
}

function ref(pathname, content) {
  return { path: pathname, sha256: sha256(content), bytes: Buffer.byteLength(content) };
}

function assertSafeRelative(name) {
  assert(typeof name === 'string' && /^[A-Za-z0-9_./-]+$/.test(name) && !name.startsWith('/') && !name.split('/').includes('..'), `unsafe_object_path:${name}`);
}

export async function buildPublicArchitecture({ output = OUTPUT, asOfDate = beijingDate(Date.now()) } = {}) {
  const tracked = git('ls-files', '--', path.relative(ROOT, output)).trim();
  assert(!tracked, 'architecture_public_output_must_not_be_tracked');
  const markerText = await readFile(path.resolve(ROOT, MARKER_FILE), 'utf8');
  const marker = JSON.parse(markerText);
  const publicationSlot = markerPublicationSlot(marker);
  const markerModeValid = marker.mode === 'slot-release'
    || (marker.mode === 'scope-correction' && marker.releasePolicy === 'deletion-only'
      && Array.isArray(marker.publishableDois) && marker.publishableDois.length === 0);
  assert(markerModeValid && (/^\d{4}-\d{2}-\d{2}T08:00:00\+08:00$/.test(publicationSlot)
    || publicationSlot === RETIRED_LAST_EVENING_SLOT), 'invalid_release_marker');

  const texts = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async name => {
    const file = path.join(PUBLIC, name);
    try { return [name, await readFile(file, 'utf8')]; }
    catch (error) {
      // literature-supplement.json is a generated Pages compatibility artifact.
      // PR/site-quality builds may not have generated it yet; production Pages
      // does so before this builder runs.
      if (name === 'literature-supplement.json' && error?.code === 'ENOENT') {
        return [name, JSON.stringify({ papers: [] })];
      }
      throw error;
    }
  })));
  const source = collectPapers(Object.fromEntries(DATA_FILES.map(name => [name, texts[name]])), isExcludedDoi);
  const built = collectPapers(texts, isExcludedDoi);
  const sourceDois = [...source.keys()].sort();
  const builtDois = [...built.keys()].sort();
  assertPartition(marker, sourceDois);
  assert(sameSet(sourceDois, builtDois), 'public_architecture_source_union_mismatch');

  const queue = await json('public/toc-demand-live.json');
  assert(Array.isArray(queue.articles) && queue.webpageDoiCount === queue.articles.length, 'queue_registry_incomplete');
  assert(sameSet(sourceDois, queue.articles.map(row => String(row.doi || '').trim().toLowerCase())), 'queue_registry_generation_mismatch');

  const corrections = await loadScopeCorrections(ROOT);
  const withdrawn = corrections.map(row => String(row.doi || '').trim().toLowerCase());
  const sourceCommit = git('rev-parse', 'HEAD');
  const markerBlobSha = blobSha(markerText);
  const datasetSha256 = sha256(pretty(sourceDois));
  const bundle = buildCatalog([...built.values()], {
    asOfDate,
    source: { commit: sourceCommit, datasetSha256, publicationSlot, markerBlobSha, parityBasis:'pages-authorized-public-build' },
    withdrawn,
  });
  const verification = verifyCatalog(bundle.files, [...built.values()]);
  assert(verification.records === marker.productionCards, 'catalog_count_marker_mismatch');

  const groups = TITLE_PRECEDENCE.map(name => parsePapers(name, texts[name]));
  const sourceHashes = Object.fromEntries(TITLE_PRECEDENCE.map(name => [name, sha256(texts[name])]));
  const presentation = buildLegacyTitlePresentation(bundle.records, groups, {
    catalogId: bundle.catalog.recordSetHash,
    sourceHashes,
  });
  const presentationText = stable(presentation) + '\n';
  const presentationRef = ref(`title-presentation.${sha256(presentationText)}.json`, presentationText);

  // Preserve publication-date uncertainty. Only fresh, reviewed additions with
  // unknown/future dates join the ordinary three-month Hot landing for seven days.
  const hotCandidateDois = new Set([
    ...bundle.partitions.hot, ...bundle.partitions.future, ...bundle.partitions.date_unknown,
  ]);
  const hotCandidateRecords = bundle.records
    .filter(row => hotCandidateDois.has(row.doi) && isHotLandingEligible(row, asOfDate))
    .sort((a, b) => hotLandingSortDate(b, asOfDate).localeCompare(hotLandingSortDate(a, asOfDate))
      || a.doi.localeCompare(b.doi));
  const hotFallbackBody = {
    schema: 'gallery-hot-fallback-v1',
    catalogId: bundle.catalog.recordSetHash,
    doiSetHash: bundle.catalog.doiSetHash,
    publicationSlot,
    sourceCommit,
    generatedAsOfDate: asOfDate,
    scope: 'hot-plus-future-candidates',
    count: hotCandidateDois.size,
    records: hotCandidateRecords,
  };
  const hotFallbackText = stable(hotFallbackBody) + '\n';
  const hotFallbackRef = ref(`hot-fallback.${sha256(hotFallbackText)}.json`, hotFallbackText);
  assert(hotFallbackRef.bytes <= 4 * 1024 * 1024, 'hot_fallback_over_budget');

  const hotDateBuckets = new Map();
  for (const row of hotCandidateRecords) {
    const date = typeof row.firstOnlineDate === 'string' ? row.firstOnlineDate : null;
    const precision = row.datePrecision === 'day' ? 'day' : 'unknown';
    const addedDate = typeof row.addedDate === 'string' ? row.addedDate : null;
    const key = `${date || ''}|${precision}|${addedDate || ''}`;
    const prior = hotDateBuckets.get(key) || {
      firstOnlineDate: date, datePrecision: precision, addedDate, count: 0,
    };
    prior.count += 1;
    hotDateBuckets.set(key, prior);
  }
  const hotHeadRecordLimit = RESULT_WINDOW_SIZE + bundle.partitions.future.length;
  const hotHeadBody = {
    schema: 'gallery-hot-head-v1',
    catalogId: bundle.catalog.recordSetHash,
    doiSetHash: bundle.catalog.doiSetHash,
    publicationSlot,
    sourceCommit,
    generatedAsOfDate: asOfDate,
    scope: 'hot-plus-future-candidates',
    pageSize: RESULT_WINDOW_SIZE,
    candidateCount: hotCandidateRecords.length,
    dateBuckets: [...hotDateBuckets.values()],
    count: Math.min(hotHeadRecordLimit, hotCandidateRecords.length),
    records: hotCandidateRecords.slice(0, hotHeadRecordLimit),
  };
  const hotHeadText = stable(hotHeadBody) + '\n';
  const hotHeadRef = ref(`hot-head.${sha256(hotHeadText)}.json`, hotHeadText);
  assert(hotHeadRef.bytes <= 512 * 1024, 'hot_head_over_budget');

  const members = Object.fromEntries(bundle.records.map(row => [row.doi, row.revision]));
  const serial = Date.parse(publicationSlot);
  assert(Number.isSafeInteger(serial), 'membership_serial_invalid');
  const membershipBody = {
    schema: MEMBERSHIP_SCHEMA,
    scope: 'all-time',
    complete: true,
    publicationSlot,
    sourceCommit,
    markerBlobSha,
    catalogId: bundle.catalog.recordSetHash,
    doiSetHash: bundle.catalog.doiSetHash,
    serial,
    count: bundle.records.length,
    members,
    withdrawn: [...withdrawn].sort(),
  };
  const membershipText = stable(membershipBody) + '\n';
  const membershipRef = ref(`membership.${sha256(membershipText)}.json`, membershipText);

  const acquisitionBody = {
    schema: 'gallery-acquisition-basis-v1',
    catalogId: bundle.catalog.recordSetHash,
    doiSetHash: bundle.catalog.doiSetHash,
    publicationSlot,
    count: bundle.records.length,
    records: bundle.records.map(row => ({
      doi: row.doi,
      revision: row.revision,
      firstOnlineDate: row.firstOnlineDate,
      datePrecision: row.datePrecision,
      addedDate: row.addedDate || null,
    })),
  };
  const acquisitionText = stable(acquisitionBody) + '\n';
  const acquisitionRef = ref(`acquisition-basis.${sha256(acquisitionText)}.json`, acquisitionText);

  const generated = {
    ...bundle.files,
    [presentationRef.path]: presentationText,
    [membershipRef.path]: membershipText,
    [acquisitionRef.path]: acquisitionText,
    [hotFallbackRef.path]: hotFallbackText,
    [hotHeadRef.path]: hotHeadText,
  };
  const objects = Object.entries(generated).map(([pathname, content]) => {
    assertSafeRelative(pathname);
    return ref(pathname, content);
  }).sort((a,b) => a.path.localeCompare(b.path));

  const catalogCurrentText = generated['current.json'];
  const release = {
    schema: SCHEMA,
    productionActivation: false,
    frontendReadActivation: true,
    publicationSlot,
    sourceCommit,
    markerBlobSha,
    datasetSha256,
    asOfDate,
    recordCount: bundle.records.length,
    catalogId: bundle.catalog.recordSetHash,
    doiSetHash: bundle.catalog.doiSetHash,
    catalogCurrent: ref('current.json', catalogCurrentText),
    membership: membershipRef,
    acquisitionBasis: acquisitionRef,
    titlePresentation: presentationRef,
    hotFallback: hotFallbackRef,
    hotHead: hotHeadRef,
    hotHeadInline: hotHeadBody,
    objects,
  };
  const releaseText = stable(release) + '\n';

  const tmp = output + `.tmp-${process.pid}-${Date.now()}`;
  await rm(tmp, { recursive:true, force:true });
  await mkdir(tmp, { recursive:true });
  for (const [pathname, content] of Object.entries(generated)) {
    const target = path.join(tmp, pathname);
    assert(target.startsWith(tmp + path.sep), 'output_path_escape');
    await mkdir(path.dirname(target), { recursive:true });
    await writeFile(target, content, { flag:'wx' });
  }
  await writeFile(path.join(tmp, 'release.json'), releaseText, { flag:'wx' });

  for (const object of objects) {
    const bytes = await readFile(path.join(tmp, object.path));
    assert(bytes.length === object.bytes && sha256(bytes) === object.sha256, `object_verification_failed:${object.path}`);
  }
  const releaseRoundtrip = JSON.parse(await readFile(path.join(tmp,'release.json'),'utf8'));
  assert(releaseRoundtrip.schema === SCHEMA && releaseRoundtrip.recordCount === marker.productionCards, 'release_roundtrip_invalid');
  assert(releaseRoundtrip.membership.sha256 === membershipRef.sha256, 'membership_release_mismatch');
  assert(releaseRoundtrip.acquisitionBasis.sha256 === acquisitionRef.sha256, 'acquisition_release_mismatch');
  assert(releaseRoundtrip.hotFallback.sha256 === hotFallbackRef.sha256, 'hot_fallback_release_mismatch');
  assert(releaseRoundtrip.hotHead.sha256 === hotHeadRef.sha256, 'hot_head_release_mismatch');
  assert(stable(releaseRoundtrip.hotHeadInline) === stable(hotHeadBody), 'hot_head_inline_release_mismatch');
  assert(sha256(stable(releaseRoundtrip.hotHeadInline) + '\n') === hotHeadRef.sha256, 'hot_head_inline_hash_mismatch');

  await rm(output, { recursive:true, force:true });
  await mkdir(path.dirname(output), { recursive:true });
  await rename(tmp, output);

  const report = {
    ok:true, schema:SCHEMA, publicationSlot, sourceCommit,
    recordCount:bundle.records.length, hot:bundle.partitions.hot.length, archive:bundle.partitions.archive.length,
    objectCount:objects.length, totalObjectBytes:objects.reduce((n,row)=>n+row.bytes,0),
    largestObjectBytes:Math.max(0,...objects.map(row=>row.bytes)),
    titleCompatibilityOverrides:Object.keys(presentation.overrides).length,
    hotFallbackCandidates:hotFallbackBody.count,
    hotHeadRecords:hotHeadBody.count,
    hotHeadBytes:hotHeadRef.bytes,
    productionActivation:false, frontendReadActivation:true, dispatchEnabled:false,
  };
  console.log('GALLERY_ARCHITECTURE_PUBLIC ' + JSON.stringify(report));
  return { release, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildPublicArchitecture(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; }
}
