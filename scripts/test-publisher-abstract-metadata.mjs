import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publisherMetadataAbstract} from './lib/publisher-abstract-metadata.mjs';
const DOI='10.1038/s41586-026-11043-z';
const TEXT='We describe a new bond construction enabling selective functionalization of aliphatic compounds under mild conditions. The method offers a broad substrate range and is supported by mechanistic control experiments with radical probes.';
const head=(doi,extra='')=>`<html><head><meta name="citation_doi" content="${doi}">${extra}</head><body><div>UNLICENSED COMPLETE FULL TEXT MUST NOT BE READ</div></body></html>`;

test('accept exact publisher DOI plus explicit verified citation abstract',()=>{
  const html=head(DOI,`<meta content="${TEXT}" name="citation_abstract">`);
  assert.equal(publisherMetadataAbstract(html,DOI),TEXT);
});
test('reject title matches, wrong DOI, Open Graph page descriptions and article body',()=>{
  const tag=`<meta name="citation_abstract" content="${TEXT}">`;
  assert.equal(publisherMetadataAbstract(head('10.1038/other',tag),DOI),'');
  assert.equal(publisherMetadataAbstract(head(DOI,`<meta name="og:description" content="${TEXT}">`),DOI),'');
  assert.equal(publisherMetadataAbstract(head(DOI),DOI),'');
  assert.equal(publisherMetadataAbstract('<html><body>'+tag+'</body></html>',DOI),'');
});
test('decode entity-safe scientific words and dc.description without adding website marketing text',()=>{
  const abstract=TEXT.replace('and is supported','&amp; is supported');
  const html=head(DOI,`<meta property='DC.description' content='${abstract}'>`);
  assert.ok(publisherMetadataAbstract(html,DOI).includes('& is supported'));
});
test('reject short and URL-only metadata',()=>{
  assert.equal(publisherMetadataAbstract(head(DOI,'<meta name="citation_abstract" content="This paper reports a reaction.">'),DOI),'');
  assert.equal(publisherMetadataAbstract(head(DOI,'<meta name="citation_abstract" content="https://doi.org/10.1038/s41586-026-11043-z">'),DOI),'');
});
