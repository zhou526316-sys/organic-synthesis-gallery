import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publisherMetadataAbstract,fetchPublisherMetadataAbstract} from './lib/publisher-abstract-metadata.mjs';
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

test('reject malformed publisher metadata that is only in the article body',()=>{
  const html='<html><head><meta name="citation_doi" content="'+DOI+'"></head><body>'
    +'<meta name="citation_abstract" content="'+TEXT+'"></body></html>';
  assert.equal(publisherMetadataAbstract(html,DOI),'');
});
test('follow HTTPS DOI redirects only to allowlisted publisher and handle split HEAD boundaries',async()=>{
  const html=head(DOI,`<meta name="citation_abstract" content="${TEXT}">`);
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),redirect:options.redirect});
    if(String(url).startsWith('https://doi.org/')){
      return new Response(null,{status:302,headers:{location:'https://www.nature.com/articles/example'}});
    }
    const split=html.indexOf('</head>')+3;
    const encoded=new TextEncoder();
    const stream=new ReadableStream({start(ctrl){
      ctrl.enqueue(encoded.encode(html.slice(0,split)));
      ctrl.enqueue(encoded.encode(html.slice(split)));
      ctrl.close();
    }});
    return new Response(stream,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  };
  assert.equal(await fetchPublisherMetadataAbstract(DOI,{fetchImpl}),TEXT);
  assert.equal(calls.length,2);
  assert.equal(calls[0].redirect,'manual');
});
test('do not issue any fetch to unknown DOI redirect destination',async()=>{
  const calls=[];
  const fetchImpl=async(url)=>{
    calls.push(String(url));
    return new Response(null,{status:302,headers:{location:'https://127.0.0.1:8443/private'}});
  };
  await assert.rejects(()=>fetchPublisherMetadataAbstract(DOI,{fetchImpl}),/redirect_host_unrecognized/);
  assert.equal(calls.length,1);
});
test('reject a complete page missing publisher DOI even when citation_abstract is present',()=>{
  assert.equal(publisherMetadataAbstract('<html><head><meta name="citation_abstract" content="'+TEXT
    +'"></head><body></body></html>',DOI),'');
});
