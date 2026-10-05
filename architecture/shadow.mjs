/** Read-only phase-A builder. It never invokes a crawler, writer, dispatcher or deployer. */
import { readFile, mkdir, writeFile, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DATA_FILES, LIVE_FILES, collectPapers, assertPartition, sameSet, validateManifest } from '../scripts/pages-release-delivery.mjs';
import { isExcludedDoi } from '../shared/literature-policy.js';
import { loadScopeCorrections, SCOPE_CORRECTIONS_FILE } from '../scripts/lib/scope-corrections.mjs';
import { buildCatalog, verifyCatalog, stable, digest } from './catalog.mjs';
import { beijingDate } from '../shared/literature-lifecycle.mjs';
import { architectureReleaseBasis } from './release-basis.mjs';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const blobSha = bytes => createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const args = process.argv.slice(2), opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--verify-live') opts.live = true;
  else if (args[i] === '--save-fixtures') opts.fixtures = true;
  else if (['--as-of', '--out'].includes(args[i]) && args[i + 1]) opts[args[i].slice(2)] = args[++i];
  else throw new Error(`unknown_argument:${args[i]}`);
}
if (opts.fixtures && !opts.live) throw new Error('fixtures_require_byte_verified_live_input');
const root = process.cwd();
const output = path.resolve(opts.out || 'artifacts/gallery-architecture-shadow');
for (const protectedDir of ['public','src','shared','scripts','audit','cloudflare','.github','.git','architecture']) {
  const p = path.resolve(root, protectedDir);
  assert(output !== p && !output.startsWith(p + path.sep), 'output_must_not_be_a_production_or_source_directory');
}
assert(output !== root && !root.startsWith(output + path.sep), 'unsafe_output_directory');
try { await access(output); throw new Error('output_exists_choose_fresh_directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const read = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await read(file));
const git = (...a) => execFileSync('git', a, { cwd: root, encoding:'utf8' }).trim();
const inputFingerprint = async receiptFile => {
  const files = [...DATA_FILES.map(n=>`public/${n}`), 'public/toc-demand-live.json', 'audit/publication-release-state.json',
    receiptFile, SCOPE_CORRECTIONS_FILE, 'shared/literature-policy.js'];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, digest(await read(file))])));
};
let temporary;
const fixtures = {}, fixtureHashes = {};
try {
  const markerText = await read('audit/publication-release-state.json'), marker = JSON.parse(markerText), markerHash = blobSha(markerText);
  const releaseBasis = architectureReleaseBasis(marker);
  const before = await inputFingerprint(releaseBasis.receiptFile), commit = git('rev-parse','HEAD');
  const receipt = await readJson(releaseBasis.receiptFile);
  assert(receipt.ok === true && receipt.markerBlobSha === markerHash, 'repository_is_not_the_verified_generation');
  assert(receipt.publicationSlot === releaseBasis.publicationSlot && receipt.productionCards === marker.productionCards, 'receipt_marker_mismatch');
  for (const [file, expected] of Object.entries(marker.protectedBlobs || {})) {
    assert(!path.isAbsolute(file) && !file.split('/').includes('..'), 'unsafe_protected_path');
    assert(blobSha(await read(file)) === expected, `protected_input_changed:${file}`);
  }
  const texts = Object.fromEntries(await Promise.all(DATA_FILES.map(async name => [name, await read(`public/${name}`)])));
  const source = collectPapers(texts, isExcludedDoi), dois = [...source.keys()].sort();
  assertPartition(marker, dois);
  assert(digest(JSON.stringify(dois, null, 2) + '\n') === receipt.datasetSha256, 'receipt_doi_digest_mismatch');
  const queue = await readJson('public/toc-demand-live.json');
  assert(Array.isArray(queue.articles) && sameSet(dois, queue.articles.map(r=>String(r.doi).toLowerCase())), 'queue_membership_not_complete');
  await read(SCOPE_CORRECTIONS_FILE); // Missing corrections must not silently mean an empty registry.
  const corrections = await loadScopeCorrections(root);
  const withdrawn = corrections.map(row=>row.doi.toLowerCase());
  let papers = [...source.values()], parityBasis = 'repository-release-collector';
  let liveVerification = { attempted: false, ok: false };
  if (opts.live) {
    const site = 'https://gallery.gczhouwld.com/';
    const get = async name => {
      const url = new URL(name, site); url.searchParams.set('architecture-shadow', String(Date.now()));
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'cache-control':'no-cache' } });
      assert(res.ok && new URL(res.url).origin === new URL(site).origin, `live_fetch_failed:${name}`);
      return Buffer.from(await res.arrayBuffer());
    };
    const deliveryBytes = await get('release-delivery.json'), delivery = JSON.parse(deliveryBytes);
    validateManifest(delivery, marker, markerHash);
    const live = {};
    for (const name of LIVE_FILES) {
      const bytes = await get(name);
      assert(digest(bytes) === delivery.files[name], `live_bytes_changed:${name}`);
      if (opts.fixtures) { fixtures[name] = bytes; fixtureHashes[name] = { sha256:digest(bytes), receiptBound:true }; }
      if (name !== 'index.html' && name !== 'title-translations-zh.json') live[name] = bytes.toString('utf8');
    }
    if (opts.fixtures) {
      // Existing public title supplement; frozen separately, not falsely claimed as receipt-bound.
      const name = 'paper-title-resolutions.json', bytes = await get(name);
      JSON.parse(bytes);
      assert((await get(name)).equals(bytes), 'resolution_snapshot_changed');
      fixtures[name] = bytes; fixtureHashes[name] = { sha256:digest(bytes), receiptBound:false, stableDoubleRead:true };
    }
    const published = collectPapers(live, isExcludedDoi);
    assert(sameSet(dois, [...published.keys()]), 'published_repository_doi_mismatch');
    assert((await get('release-delivery.json')).equals(deliveryBytes), 'live_generation_changed_during_read');
    papers = [...published.values()]; parityBasis = 'byte-verified-live-release-collector';
    liveVerification = { attempted:true, ok:true, datasetSha256:delivery.datasetSha256, sourceCommit:delivery.sourceCommit };
  }
  const asOfDate = opts['as-of'] || beijingDate(Date.now());
  const bundle = buildCatalog(papers, { asOfDate, source: { commit, datasetSha256:receipt.datasetSha256,
    publicationSlot:releaseBasis.publicationSlot, markerBlobSha:markerHash, parityBasis, inputHashes:before }, withdrawn });
  const result = verifyCatalog(bundle.files, papers);
  const after = await inputFingerprint(releaseBasis.receiptFile);
  assert(stable(before) === stable(after), 'inputs_changed_during_shadow_build');
  temporary = output + `.tmp-${process.pid}`;
  await mkdir(path.dirname(output), { recursive:true });
  await mkdir(temporary, { recursive:false });
  for (const [file, content] of Object.entries(bundle.files)) {
    const target = path.join(temporary, file); await mkdir(path.dirname(target), { recursive:true }); await writeFile(target, content, { flag:'wx' });
  }
  const reloaded = Object.fromEntries(await Promise.all(Object.keys(bundle.files).map(async name=>[name,await readFile(path.join(temporary,name),'utf8')])));
  verifyCatalog(reloaded, papers);
  if (opts.fixtures) {
    const dir = path.join(temporary,'validation/public'); await mkdir(dir,{recursive:true});
    for (const [name, bytes] of Object.entries(fixtures)) await writeFile(path.join(dir,name),bytes,{flag:'wx'});
    await writeFile(path.join(temporary,'validation/fixtures.json'),stable(fixtureHashes)+'\n',{flag:'wx'});
  }
  const report = { schemaVersion:1, phase:'A-shadow', ...result, asOfDate, sourceCommit:commit, parityBasis, liveVerification,
    receiptMode:releaseBasis.mode, receiptFile:releaseBasis.receiptFile, publicationSlot:releaseBasis.publicationSlot,
    productionActivated:false, dispatchEnabled:false, protectedInputsUnchanged:true,
    sourceCollection:'existing pages-release-delivery collectPapers; not browser-local overrides',
    legacyRenderedUiParity:'not-yet-tested', stagedFigureInventory:'not-consumed',
    nextGate:'browser-visible field parity, current-membership fence and queue-coverage-v6 adapter before reader activation' };
  await writeFile(path.join(temporary,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await mkdir(path.dirname(output),{recursive:true});
  await rename(temporary, output);
  console.log('GALLERY_ARCHITECTURE_SHADOW ' + JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ ok:false, phase:'A-shadow', productionActivated:false, error:error.message, diagnosticDirectory:temporary || null }));
  process.exitCode = 1;
}
