import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLegacyTitlePresentation,applyTitlePresentation} from '../title-presentation.mjs';
const id='a'.repeat(64), revision='b'.repeat(64), doi='10.1234/example';
const record={doi,revision,paper:{doi,title:'Full current title',authors:['X'],date:'2026-07-01'}};
const options={catalogId:id,sourceHashes:{'baseline':'c'.repeat(64)}};
const build=groups=>buildLegacyTitlePresentation([record],groups,options);
test('legacy first-title precedence is explicit and does not mutate canonical source',()=>{
 const overlay=build([[{doi,title:'Old short title'}],[record.paper]]);
 assert.equal(applyTitlePresentation(record,overlay,id).title,'Old short title');
 assert.equal(record.paper.title,'Full current title');
 assert.equal(overlay.policy,'display-compatibility-not-fact-correction');
});
test('unchanged titles do not create duplicate presentation rows',()=>assert.equal(Object.keys(build([[record.paper]]).overrides).length,0));
test('placeholder titles do not suppress a later real title',()=>{
 const overlay=build([[{doi,title:'待核验'}],[record.paper]]);assert.deepEqual(overlay.overrides,{});
});
test('an unrelated DOI can never supply the title',()=>{
 const overlay=build([[{doi:'10.1234/other',title:'Wrong paper'}]]);assert.equal(applyTitlePresentation(record,overlay,id).title,record.paper.title);
});
test('same title never merges distinct DOI identities',()=>{
 const second={...record,doi:'10.1234/second',paper:{...record.paper,doi:'10.1234/second'}};
 const overlay=buildLegacyTitlePresentation([record,second],[[{doi,title:'old'}]],options);
 assert.equal(Object.keys(overlay.overrides).length,1);
 assert.equal(applyTitlePresentation(second,overlay,id).title,record.paper.title);
});
test('presentation requires hashed frozen source identities',()=>assert.throws(()=>buildLegacyTitlePresentation([record],[],{catalogId:id,sourceHashes:{}}),/source_identity/));
test('old presentation cannot overwrite a corrected new revision',()=>{
 const overlay=build([[{doi,title:'old'}]]);assert.throws(()=>applyTitlePresentation({...record,revision:'d'.repeat(64)},overlay,id),/revision/);
});
test('presentation cannot alter DOI, authors, dates or arbitrary fields',()=>{
 const overlay=build([[{doi,title:'old'}]]);overlay.overrides[doi].doi='10.1234/other';
 assert.throws(()=>applyTitlePresentation(record,overlay,id),/field/);
});
test('presentation from another catalog is not reused',()=>assert.throws(()=>applyTitlePresentation(record,build([]),'d'.repeat(64)),/generation/));
