import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOpenAlexDateWindows } from './lib/openalex-date-window-fetch.mjs';

const rows = Array.from({ length: 24 }, (_, i) => ({
  id: `work-${i + 1}`,
  publication_date: `2026-10-${String(1 + Math.floor(i / 3)).padStart(2, '0')}`,
}));
const simulatedPage = (inputRows, requests) => async ({ startDate, endDate, perPage }) => {
  requests.push({ startDate, endDate, perPage });
  const matches = inputRows.filter(x => x.publication_date >= startDate && x.publication_date <= endDate);
  return { meta: { count: matches.length }, results: matches.slice(0, perPage) };
};

test('recovers all works from an over-200-equivalent window without any page-two cursor', async () => {
  const requests = [];
  const observed = [];
  const receipt = await fetchOpenAlexDateWindows({
    startDate: '2026-10-01', endDate: '2026-10-08', perPage: 4,
    fetchPage: simulatedPage(rows, requests), onRecord: row => observed.push(row.id),
  });
  assert.equal(observed.length, rows.length);
  assert.deepEqual(new Set(observed), new Set(rows.map(row => row.id)));
  assert.ok(requests.length > 1);
  assert.equal(receipt.records, 24);
  assert.equal(receipt.requests, requests.length);
  assert.ok(receipt.dateSplits > 0);
  assert.ok(requests.every(x => !Object.hasOwn(x, 'cursor')));
});

test('exactly full one-page query is complete when meta.count agrees', async () => {
  const matched = rows.slice(0, 3);
  let calls = 0;
  const result = await fetchOpenAlexDateWindows({
    startDate: '2026-10-01', endDate: '2026-10-01', perPage: 3,
    fetchPage: async () => { calls += 1; return { meta: { count: 3 }, results: matched }; },
    onRecord: () => {},
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { requests: 1, records: 3, dateSplits: 0 });
});

test('more than one-page works on a single day fail closed', async () => {
  await assert.rejects(fetchOpenAlexDateWindows({
    startDate: '2026-10-01', endDate: '2026-10-01', perPage: 2,
    fetchPage: async () => ({ meta: { count: 3 }, results: rows.slice(0, 2) }),
    onRecord: () => {},
  }), /daily page overflow/);
});

test('missing or inconsistent metadata cannot silently mark a source healthy', async () => {
  for (const meta of [undefined, { count: 1 }, { count: '2' }]) {
    await assert.rejects(fetchOpenAlexDateWindows({
      startDate: '2026-10-01', endDate: '2026-10-01',
      fetchPage: async () => ({ meta, results: rows.slice(0, 2) }),
      onRecord: () => {},
    }), /unverified page metadata/);
  }
});

test('source 401 and request budget exhaustion remain explicit failures', async () => {
  await assert.rejects(fetchOpenAlexDateWindows({
    startDate: '2026-10-01', endDate: '2026-10-02',
    fetchPage: async () => { throw new Error('401 unauthorized'); }, onRecord: () => {},
  }), /401 unauthorized/);
  await assert.rejects(fetchOpenAlexDateWindows({
    startDate: '2026-10-01', endDate: '2026-10-08', perPage: 2, maxRequests: 1,
    fetchPage: simulatedPage(rows, []), onRecord: () => {},
  }), /request budget exhausted/);
});

test('invalid ranges cannot narrow source coverage', async () => {
  for (const [startDate, endDate] of [
    ['2026-10-03', '2026-10-01'], ['2026-02-30', '2026-03-05'], ['2026-10-01', '2026-10-32'],
  ]) {
    await assert.rejects(fetchOpenAlexDateWindows({
      startDate, endDate, fetchPage: simulatedPage([], []), onRecord: () => {},
    }));
  }
});
