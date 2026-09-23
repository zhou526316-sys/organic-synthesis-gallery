const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync('src/user-ui/display-mutation-scope.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const api = {};
new Function('exports', output)(api);
const { shouldScanDisplay } = api;
const root = {};
const head = { parent: root, contains(node) { for (let current = node; current; current = current.parent) if (current === this) return true; return false; } };
const style = { parent: head };
const styleText = { parent: style };
const body = { parent: root };
const gallery = { parent: body };
const card = { parent: gallery };

test('head stylesheet insertion, removal and text updates do not rescan the corpus', () => {
  assert.equal(shouldScanDisplay([{ target: head }, { target: style }, { target: styleText }], head), false);
});
test('new, changed and removed card content retains the display recovery path', () => {
  for (const target of [body, gallery, card]) assert.equal(shouldScanDisplay([{ target }], head), true);
});
test('root language changes and mixed batches cannot be discarded as decoration', () => {
  assert.equal(shouldScanDisplay([{ target: root }], head), true);
  assert.equal(shouldScanDisplay([{ target: head }, { target: gallery }], head), true);
});
test('empty batches do no work and a missing head never suppresses content', () => {
  assert.equal(shouldScanDisplay([], head), false);
  assert.equal(shouldScanDisplay([{ target: body }], null), true);
});
