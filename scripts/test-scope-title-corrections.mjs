import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CURRENT_TITLE_TRANSLATIONS, chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';
import { loadScopeCorrections, validateScopeCorrections, withScopeCorrections, scopeDecisionFailures } from './lib/scope-corrections.mjs';
const passed = [];
function test(name, fn) { fn(); passed.push(name); }
for (const row of CURRENT_TITLE_TRANSLATIONS) test(`bundled_title:${row.doi}`, () => {
  assert(validChineseTitle(row.zh));
  assert.equal(chineseTitle(row, new Map([[row.title, row.title]])), row.zh);
});
test('original_bilingual_catalog_is_preserved_and_may_grow', () => {
  assert(CURRENT_TITLE_TRANSLATIONS.length >= 24);
  assert.equal(new Set(CURRENT_TITLE_TRANSLATIONS.map(row => row.doi)).size, CURRENT_TITLE_TRANSLATIONS.length);
});
test('english_is_not_a_chinese_translation', () => assert.equal(validChineseTitle('Enantioselective synthesis'), false));
test('placeholder_is_not_a_translation', () => assert.equal(validChineseTitle('标题待核验'), false));
test('inline_chinese_without_storage', () => assert.equal(chineseTitle({ title: 'Unlisted title', titleZh: '独立中文标题' }), '独立中文标题'));
test('normalized_whitespace_cache', () => assert.equal(chineseTitle({ title: ' A  synthetic title ' }, new Map([['a synthetic title', '中文合成标题']])), '中文合成标题'));
test('wrong_title_does_not_use_doi_catalog', () => assert.equal(chineseTitle({ doi: CURRENT_TITLE_TRANSLATIONS[0].doi, title: 'Another article' }), ''));
test('doi_link_normalizes', () => assert.equal(chineseTitle({ ...CURRENT_TITLE_TRANSLATIONS[0], doi: 'https://doi.org/' + CURRENT_TITLE_TRANSLATIONS[0].doi }), CURRENT_TITLE_TRANSLATIONS[0].zh));
const corrections = await loadScopeCorrections();
const requiredCorrections = ['10.1021/jacs.6c13517', '10.1021/jacs.6c10701', '10.1038/s41467-026-77963-6', '10.1002/anie.7784614'];
test('explicit_user_exclusions_are_preserved_without_fixed_registry_size', () => {
  const actual = new Set(corrections.map(row => row.doi));
  for (const doi of requiredCorrections) assert(actual.has(doi), `Missing explicit user exclusion: ${doi}`);
});
test('existing_wrong_cards_enter_handoff', () => {
  const rows = withScopeCorrections([], corrections, new Set(corrections.map(row => row.doi)));
  assert.equal(rows.length, corrections.length);
  assert(rows.every(row => row.scopeCorrection.decision === 'exclude'));
});
test('applied_corrections_do_not_return_forever', () => assert.equal(withScopeCorrections([], corrections, new Set()).length, 0));
test('candidate_union_deduplicates_correction', () => {
  const rows = withScopeCorrections([{ ...corrections[0], abstract: 'existing source abstract' }], corrections, new Set([corrections[0].doi]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].abstract, 'existing source abstract');
});
test('old_includes_cannot_override_explicit_user_exclusions', () => assert.equal(scopeDecisionFailures(corrections.map(row => ({ ...row, decision: 'include' })), corrections).length, corrections.length));
test('explicit_excludes_validate', () => assert.deepEqual(scopeDecisionFailures(corrections, corrections), []));
test('unrelated_polymer_method_is_not_blanket_excluded', () => assert.deepEqual(scopeDecisionFailures([{ doi: '10.1021/jacs.6c13641', decision: 'include' }], corrections), []));
test('malformed_correction_registry_fails', () => assert.throws(() => validateScopeCorrections({ schemaVersion: 1, items: [{ ...corrections[0], decision: 'include' }] })));
const historicalCorrection = corrections.find(row => row.doi === '10.1002/anie.7784614');
test('historical_user_correction_keeps_original_online_date', () => {
  assert.equal(historicalCorrection.date, '2026-08-25');
  assert(historicalCorrection.date < '2026-09-17', 'This fixture must be older than the seven-day discovery tail');
});
test('visible_historical_wrong_card_is_reviewable_outside_discovery_window', () => {
  const rows = withScopeCorrections([], corrections, new Set([historicalCorrection.doi]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].doi, historicalCorrection.doi);
  assert.equal(rows[0].date, '2026-08-25');
  assert.equal(rows[0].reviewPriority, 'high');
  assert.equal(rows[0].scopeCorrection.decision, 'exclude');
  assert.deepEqual(rows[0].sources, [], 'A correction must not invent a publisher API discovery');
});
test('rediscovered_excluded_doi_is_not_reincluded_after_card_removal', () => {
  const rows = withScopeCorrections([{ doi: historicalCorrection.doi, date: historicalCorrection.date, title: historicalCorrection.title, sources: ['crossref:fixture:created'] }], corrections, new Set());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scopeCorrection.decision, 'exclude');
  assert.equal(scopeDecisionFailures([{ ...rows[0], decision: 'include' }], corrections).length, 1);
});
test('registry_can_grow_without_hardcoded_three_or_four_count', () => {
  const extra = { ...corrections[0], doi: '10.9999/fixture-extra-user-correction' };
  const expanded = validateScopeCorrections({ schemaVersion: 1, items: [...corrections, extra] });
  assert.equal(withScopeCorrections([], expanded, new Set(expanded.map(row => row.doi))).length, corrections.length + 1);
});
const dir = await mkdtemp(path.join(tmpdir(), 'gallery-scope-fixture-'));
try {
  assert.deepEqual(await loadScopeCorrections(dir), []);
  passed.push('frozen_pre_correction_snapshot_remains_readable');
  await mkdir(path.join(dir, 'audit'));
  await writeFile(path.join(dir, 'audit/literature-scope-corrections.json'), '{bad json');
  await assert.rejects(() => loadScopeCorrections(dir));
  passed.push('malformed_file_not_silently_treated_as_empty');
} finally { await rm(dir, { recursive: true, force: true }); }
const main = await readFile('src/main.ts', 'utf8');
const writer = await readFile('scripts/apply-fixed-slot-literature-release.mjs', 'utf8');
test('render_and_chinese_search_use_resolver', () => { assert(main.includes('return chineseTitle(paper, zhTitleCache)')); assert(main.includes('        chineseTitle(paper, zhTitleCache),')); });
test('new_release_requires_persisted_chinese_title', () => { assert(writer.includes('card.titleZh = chineseTitle')); assert(writer.includes('missing reviewed Chinese title for accepted DOI')); });
test('duplicate_static_inputs_are_purged_in_fixed_slot_writer', () => { assert(writer.includes('OPTIONAL_SUPPLEMENTS.filter(file => file !== rollingPath)')); assert(writer.includes('baselineKept')); });
const rolling = JSON.parse(await readFile('public/rolling-supplement.json', 'utf8'));
const morning = rolling.papers.filter(row => row.addedDate === '2026-09-23');
const missing = morning.filter(row => !validChineseTitle(chineseTitle(row)));
assert.equal(missing.length, 0, 'Untranslated Sep 23 card DOI(s): ' + missing.map(row => row.doi).join(', '));
console.log(JSON.stringify({ ok: true, tests: passed.length, passed, morningCards: morning.length, morningChineseCovered: morning.length - missing.length, correctionsRegistered: corrections.map(row => row.doi), productionDataModified: false, publisherRequests: false }, null, 2));
