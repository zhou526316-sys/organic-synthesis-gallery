import test from 'node:test';
import assert from 'node:assert/strict';
import { RESULT_WINDOW_SIZE, resultWindowState } from '../shared/result-window.js';

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
  assert.equal(state.page, 2);
  assert.equal(state.pages, 2);
  assert.equal(state.start, RESULT_WINDOW_SIZE);
  assert.equal(state.end, 61);
  assert.equal(state.returned, 1);
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
