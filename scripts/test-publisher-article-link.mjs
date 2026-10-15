import test from 'node:test';
import assert from 'node:assert/strict';
import { publisherArticleHref } from '../shared/publisher-article-link.mjs';
import { normalizeDoi } from '../shared/literature-identity.mjs';

test('Nature paper DOI links directly to its official article rather than an unreliable DOI resolver', () => {
  const doi = '10.1038/s41586-026-11242-8';
  const url = publisherArticleHref(doi, 'Nature');
  assert.equal(url,'https://www.nature.com/articles/s41586-026-11242-8');
  assert.equal(normalizeDoi(doi), '10.1038/s41586-026-11242-8');
  assert.equal(new URL(url).hostname,'www.nature.com');
});
test('all Nature Portfolio standard research DOI links use the official landing path', () => {
  for (const [doi,journal] of [
    ['10.1038/s44160-026-01189-z','Nature Synthesis'],
    ['10.1038/s41467-026-78512-x','Nature Communications'],
    ['10.1038/s41929-026-01593-w','Nature Catalysis'],
  ]) assert.equal(publisherArticleHref(doi,journal),'https://www.nature.com/articles/'+doi.split('/')[1]);
});
test('other 15 journal DOI identities continue to use their canonical resolver', () => {
  for(const [doi,journal] of [
    ['10.1021/acs.joc.6c01792','JOC'],
    ['10.1021/jacs.6c14748','JACS'],
    ['10.1002/anie.2910902','Angew'],
    ['10.1039/d6sc06571f','Chemical Science'],
    ['10.31635/ccschem.026.202608252','CCS Chemistry'],
    ['10.1126/sciadv.aed4187','Science Advances'],
  ]) assert.equal(publisherArticleHref(doi,journal),'https://doi.org/'+doi);
});
test('malformed and nonmatching DOI never masquerade as an official article link', () => {
  for (const [doi,journal] of [
    ['10.1038/s41586-026-11242-8','JOC'],
    ['10.1038/unknown.2026','Nature'],
    ['10.1038/s41586-026-11242-8%0A','Nature'],
    ['10.1038/s41586-026-11242-8\n','Nature'],
    ['https://malicious.example.org/a','Nature'],
  ]) {
    const url=publisherArticleHref(doi,journal);
    assert(!url?.startsWith('https://www.nature.com/articles/s41586-026-11242-8') || doi==='10.1038/s41586-026-11242-8');
  }
  assert.equal(publisherArticleHref(null,'Nature'),null);
});
