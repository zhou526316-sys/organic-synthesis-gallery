const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ReaderCountLoader } = require(process.env.COUNT_LOADER_BUNDLE || '/tmp/gallery-count-loader.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

test('overlapping concurrent callers share each DOI request', async () => {
  const requests = []; const gate = deferred(); const published = [];
  const loader = new ReaderCountLoader(async ids => { requests.push(ids); await gate.promise; return Object.fromEntries(ids.map(id => [id, 5])); }, value => published.push(value));
  const a = loader.load(['a','b']); const b = loader.load(['b','c','a']);
  await Promise.resolve(); assert.deepEqual(requests, [['a','b'], ['c']]);
  gate.resolve(); await Promise.all([a,b]);
  assert.deepEqual(Object.assign({}, ...published), { a:5,b:5,c:5 });
});
test('large sets obey the existing 150-DOI limit and repeated loads add no request', async () => {
  const sizes=[]; const loader=new ReaderCountLoader(async ids => { sizes.push(ids.length); return {}; }, () => {});
  const ids=Array.from({length:451},(_,i)=>'d'+i);
  await Promise.all([loader.load(ids),loader.load(ids)]);
  assert.deepEqual(sizes,[150,150,150,1]);
  await loader.load(ids); assert.equal(sizes.length,4);
});
test('successful reads expire rather than permanently freezing totals', async () => {
  let time=10, reads=0; const published=[];
  const loader=new ReaderCountLoader(async () => { reads++; return {a:reads}; }, value=>published.push(value),()=>time,30);
  await loader.load(['a']); time=39; await loader.load(['a']); assert.equal(reads,1);
  time=40; await loader.load(['a']); assert.equal(reads,2); assert.deepEqual(published,[{a:1},{a:2}]);
});
test('failure and missing maps remain retryable without publishing fake zero', async () => {
  let reads=0; const published=[];
  const loader=new ReaderCountLoader(async () => { reads++; if(reads===1) throw Error('offline'); if(reads===2) return undefined; return {a:8}; },value=>published.push(value));
  await loader.load(['a']); await loader.load(['a']); assert.deepEqual(published,[]);
  await loader.load(['a']); assert.deepEqual(published,[{a:8}]); assert.equal(reads,3);
});
test('pre-click read cannot overwrite a newer successful mark', async () => {
  const gate=deferred(); const published=[]; let reads=0, time=1;
  const loader=new ReaderCountLoader(async () => { reads++; return reads===1 ? gate.promise : {a:13}; },value=>published.push(value),()=>time,30);
  const pending=loader.load(['a']); await Promise.resolve();
  loader.noteMark('a'); gate.resolve({a:2}); await pending; assert.deepEqual(published,[]);
  await loader.load(['a']); assert.equal(reads,1);
  time=32; await loader.load(['a']); assert.deepEqual(published,[{a:13}]);
});
test('invalid explicit counts are rejected; valid sparse-map omission still means zero', async () => {
  let payload={a:-1,b:NaN,c:'7',d:3}; const published=[];
  const loader=new ReaderCountLoader(async()=>payload,value=>published.push(value));
  await loader.load(['a','b','c','d','e']); assert.deepEqual(published,[{d:3,e:0}]);
  payload={a:9,b:0,c:7}; await loader.load(['a','b','c']); assert.deepEqual(published[1],payload);
});
