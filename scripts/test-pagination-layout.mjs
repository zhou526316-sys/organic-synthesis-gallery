import test from 'node:test';
import assert from 'node:assert/strict';
import { resultPaginationItems } from '../shared/result-window.js';

test('pagination retains current/first/last pages without duplicate or oversized phone ranges', () => {
  let cases = 0;
  for (const compact of [false, true]) {
    for (let pages = 1; pages <= 120; pages++) {
      for (let page = 1; page <= pages + 1; page++) {
        const items = resultPaginationItems(page, pages, compact);
        const numbers = items.filter(item => typeof item === 'number');
        assert.ok(numbers.includes(Math.min(page, pages)));
        assert.equal(numbers[0], 1);
        assert.equal(numbers.at(-1), pages);
        assert.equal(new Set(numbers).size, numbers.length);
        assert.ok(numbers.every((number, index) => index === 0 || numbers[index - 1] < number));
        assert.ok(numbers.length <= (compact ? 5 : 9));
        assert.ok(items.every((item, index) => item !== 'ellipsis' || (index > 0 && index < items.length - 1 && items[index - 1] !== 'ellipsis')));
        cases++;
      }
    }
  }
  assert.equal(cases, 14760);
});

test('small phone totals do not unexpectedly expand to six or seven buttons', () => {
  for (const pages of [6, 7]) for (let page = 1; page <= pages; page++) {
    const numbers = resultPaginationItems(page, pages, true).filter(item => typeof item === 'number');
    assert.ok(numbers.length <= 5);
    assert.ok(numbers.includes(page));
  }
});

test('invalid pagination arguments fail instead of creating false page controls', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resultPaginationItems(bad, 10));
    assert.throws(() => resultPaginationItems(1, bad));
  }
});
