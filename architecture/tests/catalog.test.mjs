import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, verifyCatalog, membershipStatus, stable, digest, normalizeDoi } from '../catalog.mjs';
import { CatalogReader } from '../reader.mjs';
import { cutoffFor, classifyDate, shiftDays, parseDate, beijingDate, acquisitionEligibility } from '../../shared/literature-lifecycle.mjs';
const source = { commit: 'a'.repeat(40), datasetSha256: 'b'.repeat(64), kind: 'test-fixture' };
const paper = (n, date = '2026-10-03', extra = {}) => ({ doi: `10.1234/test.${n}`, title: `Nickel chemistry ${n}`, titleZh: `镍催化${n}`, journal: 'JACS', authors: ['A Li', 'B Zhang'], date, synthesisType: 'methodology', ...extra });
const build = (rows, options = {}) => buildCatalog(rows, { source, asOfDate: '2026-10-04', ...options });
const load = (files, fail) => {
  const requested = [];
  const reader = new CatalogReader('https://example.invalid/catalog/', { fetcher: async url => {
    const path = url.pathname.replace('/catalog/', ''); requested.push(path);
    return new Response(fail?.(path) ?? files[path] ?? 'not found', { status: Object.hasOwn(files, path) ? 200 : 404 });
  }});
  return { reader, requested };
};
for (const [date, expected] of [['2026-10-01','2026-07-01'],['2026-10-02','2026-07-02'],['2026-10-04','2026-07-04'],['2027-05-31','2027-02-28'],['2028-05-31','2028-02-29'],['2026-01-31','2025-10-31']]) {
  test(`clamped three-month cutoff ${date}`, () => assert.equal(cutoffFor(date), expected));
}
test('Gregorian cycle: every valid date has inclusive hot cutoff and exclusive earlier day', () => {
  let tested = 0;
  for (let year = 2000; year < 2400; year++) for (let month = 1; month <= 12; month++) for (let day = 1; day <= 31; day++) {
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (!parseDate(date)) continue;
    const c = cutoffFor(date);
    assert.equal(classifyDate(c, date), 'hot');
    assert.equal(classifyDate(shiftDays(c, -1), date), 'archive');
    assert.equal(classifyDate(date, date), 'hot'); tested++;
  }
  assert.equal(tested, 146097);
});
test('month addition is not substituted for subtraction policy', () => assert.equal(classifyDate('2027-02-28','2027-05-31'), 'hot'));
test('Beijing date crosses midnight independently of client timezone', () => {
  assert.equal(beijingDate(Date.parse('2026-10-03T15:59:59Z')), '2026-10-03');
  assert.equal(beijingDate(Date.parse('2026-10-03T16:00:00Z')), '2026-10-04');
  assert.throws(() => beijingDate(), /trusted_epoch/);
});
test('invalid current date is rejected', () => assert.throws(() => cutoffFor('2026-02-29'), /invalid_as_of/));
test('identity normalization retains valid parentheses, refuses unrelated URL', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC(2)?source=x'), '10.1234/abc(2)');
  assert.equal(normalizeDoi('https://bad.invalid/10.1234/abc'), null);
});
test('roundtrip preserves every public field and author order', () => {
  const rows = [paper(1, '2026-07-01', { extraPublicField: { label: 'retained' } }), paper(2)];
  assert.equal(verifyCatalog(build(rows).files, rows).records, 2);
});
test('ordering of input cannot change immutable outputs', () => {
  const rows = [paper(1), paper(2), paper(3)];
  assert.deepEqual(build(rows).files, build(rows.reverse()).files);
});
test('midnight changes lifecycle, not catalog/month shards or memberships', () => {
  const rows = [paper(1, '2026-07-03'), paper(2)];
  const a = build(rows, { asOfDate: '2026-10-03' }), b = build(rows);
  assert.deepEqual(a.catalog, b.catalog);
  assert.equal(a.partitions.hot.length, 2); assert.equal(b.partitions.hot.length, 1);
});
test('same title with two DOI remains two records', () => assert.equal(build([paper(1), paper(2, undefined, { title: 'Nickel chemistry 1' })]).records.length, 2));
test('duplicate normalized DOI blocks generation', () => assert.throws(() => build([paper(1), paper(1)]), /duplicate_doi/));
test('missing DOI cannot silently disappear', () => assert.throws(() => build([{ title: 'unresolved' }]), /unresolved_identity/));
test('withdrawn paper cannot enter catalog via stale input', () => assert.throws(() => build([paper(1)], { withdrawn: [paper(1).doi] }), /withdrawn_doi/));
test('private fields are not copied to static catalog', () => assert.throws(() => build([paper(1, undefined, { fulltext: 'private' })]), /private_field/));
test('invalid, unknown and future dates remain explicitly accounted', () => {
  const b = build([paper(1,'2026-02-31'), paper(2,'2026-07'), paper(3,'2026-10-05')]);
  assert.equal(b.partitions.date_invalid.length, 1); assert.equal(b.partitions.date_unknown.length, 1); assert.equal(b.partitions.future.length, 1);
  assert.equal(verifyCatalog(b.files).records, 3);
});
test('capacity shards retain all records', () => {
  const rows = Array.from({ length: 10 }, (_, i) => paper(i));
  const b = build(rows, { maxShardBytes: 1100 });
  assert.ok(b.catalog.shards.length > 1); assert.ok(b.catalog.shards.every(r => r.bytes <= 1100));
  assert.equal(verifyCatalog(b.files, rows).records, 10);
});
test('single oversize record blocks rather than truncates', () => assert.throws(() => build([paper(1, undefined, { title: 'a'.repeat(3000) })], { maxShardBytes: 1024 }), /single_record_over/));
test('checksum failure is not silently accepted', () => {
  const b = build([paper(1)]); b.files[b.catalog.shards[0].path] += ' ';
  assert.throws(() => verifyCatalog(b.files), /mismatch/);
});
test('missing shard is an explicit verification error', () => {
  const b = build([paper(1)]); delete b.files[b.catalog.shards[0].path];
  assert.throws(() => verifyCatalog(b.files));
});
test('field loss is detected even when DOI counts match', () => {
  const b = build([paper(1)]);
  assert.throws(() => verifyCatalog(b.files, [paper(1, undefined, { authors: [] })]), /field_loss/);
});
test('Archive remains an all-time member', () => {
  const b = build([paper(1,'2026-07-01')]);
  const registry = JSON.parse(b.files[b.catalog.membership.path]);
  assert.equal(membershipStatus(registry, paper(1).doi), 'present');
  assert.equal(b.partitions.archive.length, 1);
});
test('active or DOM subset is not an authoritative membership registry', () => {
  assert.equal(membershipStatus({ scope: 'active-work', complete: true, count: 0, dois: [], withdrawn: [] }, paper(1).doi), 'unknown');
  assert.equal(membershipStatus({ scope: 'all-time', complete: false, count: 0, dois: [], withdrawn: [] }, paper(1).doi), 'unknown');
});
test('known withdrawal differs from unknown/absence', () => {
  const b = build([], { withdrawn: [paper(1).doi] }), r = JSON.parse(b.files[b.catalog.membership.path]);
  assert.equal(membershipStatus(r, paper(1).doi), 'withdrawn'); assert.equal(membershipStatus(r, paper(2).doi), 'absent');
});
test('unknown inventory means reconciliation, not a fabricated missing asset', () => {
  const b = build([paper(1)]), p = JSON.parse(b.files['current.json']), work = JSON.parse(b.files[p.work.path]);
  assert.equal(work.acquire.length, 0); assert.equal(work.reconcile.length, 1); assert.equal(work.dispatchEnabled, false);
});
test('partial progress requests only genuinely unfinished layers', () => {
  const b = build([paper(1)], { obligations: { [paper(1).doi]: { toc: 'complete', figures: 'incomplete', evidence: 'complete' } } });
  const root = JSON.parse(b.files['current.json']), w = JSON.parse(b.files[root.work.path]);
  assert.deepEqual(w.acquire[0].needs, ['figures']);
});
test('old Archive has no default work permission', () => assert.equal(acquisitionEligibility({ doi: paper(1).doi, firstOnlineDate:'2026-07-01', datePrecision:'day' }, '2026-10-04').eligible, false));
test('late addition gets seven dates of work eligibility but remains Archive', () => {
  const r = { doi: paper(1).doi, firstOnlineDate:'2026-07-01', datePrecision:'day', addedDate:'2026-10-04' };
  assert.equal(acquisitionEligibility(r,'2026-10-10').reason, 'archive-recent-addition');
  assert.equal(acquisitionEligibility(r,'2026-10-11').eligible, false);
  assert.equal(acquisitionEligibility(r,'2026-10-04').lifecycle, 'archive');
});
test('explicit repair requires authority and unexpired bounds', () => {
  const r = { doi: paper(1).doi, firstOnlineDate:'2026-07-01', datePrecision:'day' };
  const grant = { doi:r.doi, kind:'archive-repair', reason:'correct figure', authorizationRef:'review/1', validFrom:'2026-10-04', validThrough:'2026-10-05' };
  assert.equal(acquisitionEligibility(r,'2026-10-04',[grant]).eligible,true);
  assert.equal(acquisitionEligibility(r,'2026-10-06',[grant]).eligible,false);
  assert.equal(acquisitionEligibility(r,'2026-10-04',[{ ...grant, authorizationRef:'' }]).eligible,false);
});
test('withdrawal beats active repair permission', () => assert.equal(acquisitionEligibility({ doi:paper(1).doi, firstOnlineDate:'2026-10-04', datePrecision:'day', status:'withdrawn' },'2026-10-04').eligible,false));
test('reader resolves Archive DOI without loading every month', async () => {
  const b = build([paper(1,'2026-07-01'), paper(2)]), { reader, requested } = load(b.files);
  const r = await reader.get(paper(1).doi, '2026-10-04');
  assert.equal(r.status,'published'); assert.equal(r.lifecycle,'archive');
  assert.equal(requested.filter(p => p.startsWith('shards/')).length,1);
  assert.equal(requested.filter(p => p.startsWith('search/')).length,0);
});
test('Hot reader filters boundary records without altering membership', async () => {
  const b = build([paper(1,'2026-07-03'),paper(2,'2026-07-04')]), { reader } = load(b.files);
  assert.deepEqual((await reader.hot('2026-10-04')).map(r=>r.doi), [paper(2).doi]);
  assert.equal((await reader.get(paper(1).doi,'2026-10-04')).status,'published');
});
test('global search actually finds Archive metadata', async () => {
  const b = build([paper(1,'2026-07-01'),paper(2)]), { reader } = load(b.files);
  const r = await reader.search('chemistry 1',{ asOfDate:'2026-10-04' });
  assert.equal(r.complete,true); assert.equal(r.matched,1); assert.equal(r.results[0].doi,paper(1).doi);
});
test('failed search segment reports incomplete, not global zero', async () => {
  const b = build([paper(1,'2026-07-01'),paper(2)]);
  const { reader } = load(b.files, p=>p===b.catalog.search[0].path ? 'corrupt' : undefined);
  const r = await reader.search('chemistry 1',{ asOfDate:'2026-10-04' });
  assert.equal(r.complete,false); assert.equal(r.failures.length,1);
});
test('withdrawn DOI returns explicit result without fetching a shard', async () => {
  const b = build([],{ withdrawn:[paper(1).doi] }), { reader, requested } = load(b.files);
  assert.equal((await reader.get(paper(1).doi,'2026-10-04')).status,'withdrawn');
  assert.equal(requested.filter(v=>v.startsWith('shards/')).length,0);
});
test('reader rejects corrupted object bytes', async () => {
  const b=build([paper(1)]), { reader }=load(b.files,p=>p.startsWith('shards/')?'{}':undefined);
  await assert.rejects(reader.get(paper(1).doi,'2026-10-04'),/hash_mismatch/);
});
test('reader cannot escape catalog directory', async () => {
  const { reader }=load({}); await assert.rejects(reader.read('../secret.json'),/unsafe_catalog_path/);
});
test('search cancellation is explicit', async () => {
  const b=build([paper(1)]), { reader }=load(b.files), c=new AbortController(); c.abort();
  await assert.rejects(reader.search('nickel',{ asOfDate:'2026-10-04', signal:c.signal }));
});
