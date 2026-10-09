import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidBundledStandardFont } from '../scripts/verify-pdf-vault-live.mjs';

test('TrueType hosted standard-font bytes are accepted',()=>{
  const data=Buffer.alloc(4096);
  data.set([0,1,0,0],0);
  assert.equal(isValidBundledStandardFont(data),true);
});
test('OpenType hosted standard-font bytes are accepted',()=>{
  const data=Buffer.alloc(4096);
  data.write('OTTO',0,'ascii');
  assert.equal(isValidBundledStandardFont(data),true);
});
test('HTML, a tiny fake file, or missing data cannot masquerade as a hosted font',()=>{
  const html=Buffer.from('<html>login</html>'+'.'.repeat(3000));
  const tooShort=Buffer.from([0,1,0,0]);
  assert.equal(isValidBundledStandardFont(html),false);
  assert.equal(isValidBundledStandardFont(tooShort),false);
  assert.equal(isValidBundledStandardFont(null),false);
  assert.equal(isValidBundledStandardFont(new Uint8Array(512*1024+1)),false);
});
