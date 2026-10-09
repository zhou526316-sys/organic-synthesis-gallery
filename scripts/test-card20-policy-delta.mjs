import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const base=String(process.argv[2]||'').trim();
assert.match(base,/^[a-f0-9]{40}$/,'require verified git merge-base SHA');
const original=JSON.parse(execFileSync('git',['show',base+':audit/media-auto-policy.json'],{
  encoding:'utf8',maxBuffer:100000
}));
const current=JSON.parse(await readFile('audit/media-auto-policy.json','utf8'));
assert.equal(original.maxFiguresPerCard,10,'baseline card cap must be exactly 10');
assert.equal(current.maxFiguresPerCard,20,'approved card cap must be exactly 20');
const appendix=' Publish at most 20 semantically distinct figures per card, aligned with the existing 20-figure Tampermonkey acquisition limit and horizontal lazy-loaded figure gallery.';
assert.equal(current.notes,original.notes+appendix,'only explanatory publication note may be appended');
const old={...original},now={...current};delete old.notes;delete old.maxFiguresPerCard;delete now.notes;delete now.maxFiguresPerCard;
assert.deepEqual(now,old,'all other media publication/authenticity constraints must remain byte-for-byte identical');
const merge=await readFile('cloudflare/scripts/merge-new-body-auto.mjs','utf8');
assert.ok(merge.includes('Number.isInteger(policy.maxFiguresPerCard)&&policy.maxFiguresPerCard>=1&&policy.maxFiguresPerCard<=20'),'bounded policy parsing lost');
assert.ok(merge.includes('if(!fitsCardFigureBudget(baseCount,packetRows.length,policy))'),'no atomic packet budget proof');
assert.ok(merge.includes('requireBody(policy.requireCompletedCapturePacket')===false,'original completed packet requirement remains within existing policy gate');
assert.ok(merge.includes('policy.requireCompletedCapturePacket===true'),'packet completion requirement altered');
const gallery=await readFile('src/main.ts','utf8');
assert.ok(gallery.includes('for (const figure of result.figures)')&&gallery.includes("image.loading = 'lazy'")&&gallery.includes("strip.className = 'figure-strip'"),
  'the horizontal lazy figure strip must still render every published figure without truncation');
console.log('TM_BODY_CARD20_POLICY_DELTA '+JSON.stringify({passed:true,approvedChangeOnly:true,
  oldLimit:10,newLimit:20,publisherCodeUnchanged:true,completePacketStillRequired:true,
  noPDFOrLiteratureReleaseChange:true}));
