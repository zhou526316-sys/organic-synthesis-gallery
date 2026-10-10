import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isHistoricalBackfill, isJulSepTocOnly, paperMediaPolicy, shouldShowDailyNew, isOctoberFullCapturePaper } from '../shared/historical-literature-policy.js';
import { isHotLandingEligible } from '../shared/literature-landing.mjs';
import { verifiedHistoricalTitle } from '../shared/verified-historical-title-repairs.js';

const recentDay = '2026-10-10';
const preJuly = {doi:'10.1234/historical-old',date:'1967-03-08',addedDate:recentDay,ingestionChannel:'historical_backfill'};
const july = {doi:'10.1234/historical-july',date:'2026-07-20',addedDate:recentDay,ingestionChannel:'historical_backfill'};
const lateSep = {doi:'10.1234/late-september',date:'2026-09-20',addedDate:recentDay};
const regular = {doi:'10.1234/new-oct',date:'2026-10-09',addedDate:recentDay};
const legacy = {doi:'10.1234/original-september',date:'2026-09-25',addedDate:'2026-09-26'};

assert.equal(isHistoricalBackfill(preJuly),true);
assert.equal(paperMediaPolicy(preJuly),'metadata_only');
assert.equal(paperMediaPolicy(july),'toc_only');
assert.equal(paperMediaPolicy(lateSep),'toc_only');
assert.equal(paperMediaPolicy(legacy),'toc_only');
assert.equal(paperMediaPolicy(regular),'standard');
assert.equal(isJulSepTocOnly(july),true);
assert.equal(isOctoberFullCapturePaper(july),false);
assert.equal(isOctoberFullCapturePaper(lateSep),false);
assert.equal(isOctoberFullCapturePaper(regular),true);
assert.equal(shouldShowDailyNew(preJuly,recentDay),false);
assert.equal(shouldShowDailyNew(july,recentDay),false);
assert.equal(shouldShowDailyNew(lateSep,recentDay),true); // normal newly admitted remains distinct
assert.equal(shouldShowDailyNew(regular,recentDay),true);
assert.equal(isHotLandingEligible(july,recentDay),false);
assert.equal(isHotLandingEligible(preJuly,recentDay),false);
assert.equal(isHotLandingEligible(lateSep,recentDay),true);
assert.equal(isHotLandingEligible(regular,recentDay),true);

const map = new Map([
  ['10.1021/acs.orglett.6c02216','Cobalt/Photoredox Dual-Catalyzed Alkylation of Indole with Unactivated Alkenes'],
  ['10.1038/s44160-026-01106-4','β-Selective C(sp3)–H functionalization of alkyl boronates using photoredox catalysis'],
  ['10.1038/s41467-026-77437-9','Zipper polydefluorination-monoborylation of perfluoroalkyl chains'],
]);
for(const [doi,title] of map)assert.equal(verifiedHistoricalTitle(doi),title);
assert.equal(verifiedHistoricalTitle('10.1021/acs.orglett.fake'),null);

const main=readFileSync('src/main.ts','utf8');
const queue=readFileSync('cloudflare/scripts/build-live-toc-demand-queue.mjs','utf8');
const tm=readFileSync('public/toc-mainline.user.js','utf8');
assert.ok(main.includes('!isHistoricalBackfill(paper) && isNewTodayDate(paper.addedDate)'), 'history may appear new');
assert.ok(main.includes("mediaMode === 'metadata_only' ? '' : tocMarkup(paper)"), 'old history must not queue TOC');
assert.ok(main.includes("mediaMode === 'standard' ? figureMarkup(paper) : ''"), 'TOC-only figure slot leak');
assert.ok(main.includes('doi && !historicalBackfill ? `/pdf/'), 'backfill PDF action leak');
assert.ok(main.includes('doi && !historicalBackfill ? `/pdf-vault/'), 'backfill local PDF action leak');
assert.ok(queue.includes("filter(paper => !isHistoricalBackfill(paper))"), 'history included in latestAddedDate');
assert.ok(queue.includes("isHistoricalBackfill(paper) || paperMediaPolicy(paper) === 'toc_only'"), 'history in figure-gap queue');
assert.ok(queue.includes('mediaPolicy: paperMediaPolicy(paper)'), 'TOC queue lacks capture policy');
assert.ok(tm.includes('&&recentFullCaptureEligible(job);'), 'PDF inventory guard lacks publisher-date cutoff');
assert.ok(tm.includes('opportunisticFigures:!tocOnlyCaptureEligible(raw)'), 'historical TOC would fetch body');
assert.ok(tm.includes('if(!captureJobEligible(batch[i]))'), 'historical TOC never dispatched');
console.log(JSON.stringify({ok:true,historicalCards:true,latestNewExcluded:true,oldMetadataOnly:true,julSepTocOnly:true,pdfBlocked:true,verifiedEnglishTitleRecoveries:map.size}));
