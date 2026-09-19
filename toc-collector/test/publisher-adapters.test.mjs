import assert from 'node:assert/strict';
import {
  articleUrlsForDoi,
  classifyPublisher,
  extractPublisherMediaCandidates,
  pickBestPublisherMediaCandidate,
} from '../src/publisher-adapters.mjs';

assert.equal(classifyPublisher('10.1021/jacs.6c14433'), 'acs');
assert.equal(classifyPublisher('10.1002/anie.202600001'), 'wiley');
assert.equal(classifyPublisher('10.1039/D6SC03136A'), 'rsc');
assert.equal(classifyPublisher('10.1016/j.chempr.2026.01.001'), 'elsevier');
assert.equal(classifyPublisher('10.1038/s44160-026-01158-6'), 'nature');
assert.equal(classifyPublisher('10.1126/science.abc1234'), 'science');

assert.ok(articleUrlsForDoi('10.1039/D6SC03136A').some(x => x.url.includes('/2026/sc/d6sc03136a')));
assert.equal(articleUrlsForDoi('10.1016/j.chempr.2026.01.001')[0].source, 'doi_redirect');

const acsHtml = '<section><h2>TOC and Abstract graphic</h2><figure><img alt="TOC and Abstract graphic" src="/toc.png" width="900" height="450"></figure></section><figure><figcaption>Figure 1. Mechanism.</figcaption><img src="/fig1.png"></figure>';
const acs = pickBestPublisherMediaCandidate(acsHtml, 'https://pubs.acs.org/doi/10.1021/jacs.6c14433', { doi: '10.1021/jacs.6c14433' });
assert.equal(acs.kind, 'official');
assert.equal(acs.assetType, 'toc_graphic');
assert.match(acs.src, /toc\.png$/);

const wileyHtml = '<section><h2>Graphical Abstract</h2><img alt="Graphical Abstract Image" data-src="https://onlinelibrary.wiley.com/cms/asset/ga.jpg"></section>';
const wiley = pickBestPublisherMediaCandidate(wileyHtml, 'https://onlinelibrary.wiley.com/doi/10.1002/anie.202600001', { doi: '10.1002/anie.202600001' });
assert.equal(wiley.kind, 'official');
assert.equal(wiley.assetType, 'graphical_abstract');

const rscHtml = '<div>A graphical abstract is available for this content</div><p><img alt="Graphical abstract" src="/image/article/2026/d6sc03136a-ga.jpg"></p>';
const rsc = pickBestPublisherMediaCandidate(rscHtml, 'https://pubs.rsc.org/en/content/articlelanding/2026/sc/d6sc03136a', { doi: '10.1039/D6SC03136A' });
assert.equal(rsc.kind, 'official');
assert.equal(rsc.assetType, 'graphical_abstract');

const elsevierHtml = '<section id="graphical-abstract"><h2>Graphical abstract</h2><img alt="Graphical abstract Image 1" src="https://ars.els-cdn.com/content/image/ga1_lrg.jpg"></section>';
const els = pickBestPublisherMediaCandidate(elsevierHtml, 'https://www.sciencedirect.com/science/article/pii/S0000000000', { doi: '10.1016/j.chempr.2026.01.001' });
assert.equal(els.kind, 'official');
assert.equal(els.assetType, 'graphical_abstract');

const meta = pickBestPublisherMediaCandidate('<meta name="citation_graphical_abstract" content="https://example.org/ga.png"><img alt="journal cover" src="https://example.org/cover.jpg">', 'https://example.org/article', { doi: '10.1126/science.abc1234' });
assert.equal(meta.kind, 'official');
assert.equal(meta.source, 'publisher_metadata');

const fig = pickBestPublisherMediaCandidate('<figure><figcaption>Figure 1. Reaction scope.</figcaption><img src="https://media.springernature.com/fig1.png"></figure>', 'https://www.nature.com/articles/s44160-026-01158-6', { doi: '10.1038/s44160-026-01158-6' });
assert.equal(fig.kind, 'figure1');
assert.equal(fig.assetType, 'figure1_fallback');

assert.equal(pickBestPublisherMediaCandidate('<img alt="Journal cover image" src="https://example.org/cover.jpg"><meta property="og:image" content="https://example.org/cover2.jpg">', 'https://example.org/article', { doi: '10.1021/jacs.6c14433' }), null);

const all = extractPublisherMediaCandidates(acsHtml, 'https://pubs.acs.org/doi/10.1021/jacs.6c14433', { doi: '10.1021/jacs.6c14433' });
assert.ok(all.some(x => x.kind === 'official'));
assert.ok(all.some(x => x.kind === 'figure1'));
assert.ok(all.find(x => x.kind === 'official').score > all.find(x => x.kind === 'figure1').score);

console.log(JSON.stringify({ publisherAdapters: 'passed', candidates: all.length }));
