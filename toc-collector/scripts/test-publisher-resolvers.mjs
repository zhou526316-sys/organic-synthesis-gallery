import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/background.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function semanticScore('), source.indexOf('function browserbaseHeaders('));
const nature = source.slice(source.indexOf('function springerNatureMediaCandidates('), source.indexOf('async function inspectSpringerNatureStructured('));
let response = {};
const scope = {
  classify: doi => doi.startsWith('10.1126/') ? 'science' : 'nature',
  globalThis: { fetch: async () => response }, Buffer, AbortSignal, URL,
  articleUrl: doi => 'https://www.nature.com/articles/' + doi.split('/')[1],
  nativeImage: { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1000, height: 600 }) }) },
  log: async () => {},
};
const { htmlCandidate, browserbaseOwnsDoi, springerNatureMediaCandidates, verifySpringerNatureCandidate } =
  new Function('scope', `with(scope) { ${helpers}\n${nature}; return {htmlCandidate,browserbaseOwnsDoi,springerNatureMediaCandidates,verifySpringerNatureCandidate}; }`)(scope);
for (const doi of ['10.1038/s41467-026-76235-7', '10.1038/s44160-026-01158-6']) {
  const candidates = springerNatureMediaCandidates(doi);
  assert.deepEqual(candidates.map(c => c.kind), ['official', 'figure1']);
  const candidate = candidates[0];
  response = { ok: true, url: candidate.src, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Buffer.alloc(5000) };
  assert.equal((await verifySpringerNatureCandidate(doi, candidate)).kind, 'official');
  response = { ...response, url: 'https://media.springernature.com/wrong-article.png' };
  await assert.rejects(verifySpringerNatureCandidate(doi, candidate), /redirect_ownership_mismatch/);
  response = { ...response, url: candidate.src, headers: new Headers({ 'content-type': 'text/html' }) };
  assert.equal(await verifySpringerNatureCandidate(doi, candidate), null);
  response = { ...response, ok: false, status: 404 };
  assert.equal(await verifySpringerNatureCandidate(doi, candidate), null);
}
const doi = '10.1126/science.fixture';
const url = 'https://www.science.org/doi/' + doi;
const fixture = '<meta name="citation_doi" content="' + doi + '"><figure><img src="/figure1.png"><figcaption>Figure 1. Catalytic synthesis.</figcaption></figure>';
assert.equal(browserbaseOwnsDoi(doi, url, fixture), true);
assert.equal(htmlCandidate(fixture, url).kind, 'figure1');
assert.equal(htmlCandidate('<meta name="citation_graphical_abstract" content="/ga.png">' + fixture, url).kind, 'official');
assert.equal(browserbaseOwnsDoi(doi, 'https://evilscience.org/doi/' + doi, fixture), false);
assert.equal(browserbaseOwnsDoi(doi, 'https://www.science.org/doi/10.1126/other', '<p>References: ' + doi + '</p>'), false);
assert.equal(htmlCandidate('<img src="/logo.png" alt="Figure 1 logo">', url), null);
console.log('PASS: Nature DOI-specific candidates, redirect/MIME/404 rejection, Science figure/official fixtures and DOI identity');
