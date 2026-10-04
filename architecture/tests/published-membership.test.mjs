import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublishedMembership } from '../published-membership.mjs';
import { stable, digest } from '../catalog.mjs';

const base = {
  publicationSlot:'2026-10-04T08:00:00+08:00',
  markerBlobSha:'a'.repeat(40),
  catalogId:'b'.repeat(64),
  doiSetHash:'c'.repeat(64),
  records:[
    {doi:'10.1234/a',revision:'d'.repeat(64)},
    {doi:'10.1234/b',revision:'e'.repeat(64)}
  ],
  withdrawn:['10.1234/withdrawn']
};

test('membership content is independent of Pages implementation commit',()=>{
  const a=buildPublishedMembership(base), b=buildPublishedMembership({...base, sourceCommit:'1'.repeat(40)});
  assert.equal(stable(a),stable(b));
  assert.equal(digest(stable(a)+'\n'),digest(stable(b)+'\n'));
  assert.equal(Object.hasOwn(a,'sourceCommit'),false);
});
test('same publication generation is deterministic regardless of record input order',()=>{
  const a=buildPublishedMembership(base),b=buildPublishedMembership({...base,records:[...base.records].reverse()});
  // Order in members is not semantic; canonical serialization normalizes object keys.
  assert.equal(stable(a),stable(b));
});
test('record correction changes membership content even if DOI set is unchanged',()=>{
  const a=buildPublishedMembership(base),b=buildPublishedMembership({...base,records:[{...base.records[0],revision:'f'.repeat(64)},base.records[1]]});
  assert.notEqual(stable(a),stable(b));
});
test('new publication marker changes identity',()=>{
  const a=buildPublishedMembership(base),b=buildPublishedMembership({...base,publicationSlot:'2026-10-04T18:00:00+08:00',markerBlobSha:'f'.repeat(40)});
  assert.notEqual(stable(a),stable(b)); assert.ok(b.serial>a.serial);
});
test('withdrawn DOI cannot overlap published membership',()=>assert.throws(()=>buildPublishedMembership({...base,withdrawn:['10.1234/a']}),/overlap/));
test('duplicate normalized DOI fails closed',()=>assert.throws(()=>buildPublishedMembership({...base,records:[...base.records,{doi:'HTTPS://DOI.ORG/10.1234/A',revision:'f'.repeat(64)}]}),/duplicate/));
