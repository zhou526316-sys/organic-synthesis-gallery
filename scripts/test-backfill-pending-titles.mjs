import assert from 'node:assert/strict';
import {
  pendingTitle, cleanTitle, chooseExistingTitle,
  extractCrossrefTitle, extractOpenalexTitle,
} from './backfill-pending-titles.mjs';

const doi = '10.1021/jacs.6c00001';
for (const value of [null,'','Title Pending Verification','标题待核验',
  'Verifying title…','Cloudflare checking your browser','Access Denied']) {
  assert(pendingTitle(value), 'must reject invalid title: ' + value);
}
assert(!pendingTitle('Electrochemical Enantioselective Cross-Coupling'));
assert.equal(cleanTitle('Synthesis of <i>cis</i>-C<sub>2</sub>  Acids &amp; Ketones'),
  'Synthesis of cis-C2 Acids & Ketones');
assert.equal(cleanTitle('<h1>Access denied</h1>'), '');
assert.equal(chooseExistingTitle([
  {title:'标题待核验'},
  {title:'Selective Photochemical Synthesis'},
]), 'Selective Photochemical Synthesis');
assert.equal(chooseExistingTitle([{title:'Title A'}, {title:'Title B'}]), '');
assert.equal(extractCrossrefTitle({message:{DOI:doi,title:['Crossref <i>C</i>–H Activation']}},doi),
  'Crossref C–H Activation');
assert.equal(extractCrossrefTitle({message:{DOI:'10.1021/jacs.6c00002',title:['Wrong DOI']}},doi),'');
assert.equal(extractOpenalexTitle({doi:'https://doi.org/'+doi,display_name:'OpenAlex title'},doi),
  'OpenAlex title');
assert.equal(extractOpenalexTitle({doi:'https://doi.org/10.1234/different',display_name:'Wrong DOI'},doi),'');
console.log(JSON.stringify({ok:true,tests:14,scope:'pending_title_verified_doi_only'},null,2));
