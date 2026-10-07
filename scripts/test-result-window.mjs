import test from 'node:test';
import assert from 'node:assert/strict';
import { RESULT_WINDOW_SIZE, MOBILE_RESULT_WINDOW_SIZE, resultWindowState, resultPaginationItems } from '../shared/result-window.js';

test('result window never returns more than the fixed size', () => {
  const first = resultWindowState(10000, 1);
  assert.equal(first.start, 0);
  assert.equal(first.end, RESULT_WINDOW_SIZE);
  assert.equal(first.returned, RESULT_WINDOW_SIZE);
  assert.equal(first.hasPrevious, false);
  assert.equal(first.hasNext, true);

  const later = resultWindowState(10000, 120);
  assert.equal(later.returned, RESULT_WINDOW_SIZE);
  assert.equal(later.hasPrevious, true);
  assert.equal(later.hasNext, true);
});

test('result window clamps past-the-end pages without producing an empty false page', () => {
  const state = resultWindowState(61, 99);
  assert.equal(state.page, 3);
  assert.equal(state.pages, 3);
  assert.equal(state.start, 48);
  assert.equal(state.end, 61);
  assert.equal(state.returned, 13);
  assert.equal(state.hasNext, false);
});

test('empty result has a stable first page and zero returned rows', () => {
  const state = resultWindowState(0, 1);
  assert.deepEqual(state, {
    page: 1,
    pages: 1,
    start: 0,
    end: 0,
    returned: 0,
    hasPrevious: false,
    hasNext: false,
  });
});


test('desktop keeps 24 papers and mobile uses 12 papers per result page', () => {
  assert.equal(RESULT_WINDOW_SIZE, 24);
  assert.equal(MOBILE_RESULT_WINDOW_SIZE, 12);
  assert.equal(resultWindowState(100, 1).returned, 24);
  assert.equal(resultWindowState(100, 1, MOBILE_RESULT_WINDOW_SIZE).returned, 12);
});

test('mobile pages reach every paper exactly once, including the short final page', () => {
  const total = 25;
  const indices = [];
  for (let page = 1; page <= 3; page++) {
    const state = resultWindowState(total, page, MOBILE_RESULT_WINDOW_SIZE);
    assert.equal(state.pages, 3);
    assert.equal(state.returned, page === 3 ? 1 : 12);
    assert.equal(state.hasPrevious, page > 1);
    assert.equal(state.hasNext, page < 3);
    for (let index = state.start; index < state.end; index++) indices.push(index);
  }
  assert.deepEqual(indices, Array.from({ length: total }, (_, index) => index));
  const final = resultWindowState(total, 99, MOBILE_RESULT_WINDOW_SIZE);
  assert.equal(final.start, 24);
  assert.equal(final.end, total);
  assert.equal(final.returned, 1);
});


test('pagination items keep boundaries, neighbors and ellipses', () => {
  assert.deepEqual(resultPaginationItems(1, 3), [1, 2, 3]);
  assert.deepEqual(resultPaginationItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis', 20]);
  assert.deepEqual(resultPaginationItems(10, 20), [1, 'ellipsis', 8, 9, 10, 11, 12, 'ellipsis', 20]);
  assert.deepEqual(resultPaginationItems(20, 20), [1, 'ellipsis', 16, 17, 18, 19, 20]);
  assert.deepEqual(resultPaginationItems(10, 20, true), [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
});
