// Live, read-only DOI-level proof that the registered bibliography and the
// public card abstract use the same verified metadata generation.
// This does not acquire text, figures or PDF from publishers.
import {readFile,writeFile} from 'node:fs/promises';
const SITE=new URL(process.env.GALLERY_SITE_URL||'https://gallery.gczhouwld.com/');
const API=new URL(process.env.GALLERY_API_URL||'https://api.gczhouwld.com/');
const REPORT=process.env.BASIC_ABSTRACT_LIVE_REPORT||'/tmp/gallery-basic-abstract-live.json';
const TOKEN=String(process.env.BRIDGE_WRITE_TOKEN||'').trim();
const report={schemaVersion:1,startedAt:new Date().toISOString(),ok:false,
  readOnly:true,protectedLiteratureWrites:0};
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const doi=x=>String(x||'').trim().toLowerCase();
async function json(url,admin=false){
  let error;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{
        headers:{'accept':'application/json','cache-control':'no-cache',
          ...(admin&&TOKEN?{'authorization':'Bearer '+TOKEN}:{})},
        signal:AbortSignal.timeout(16000)
      });
      const data=await response.json();
      if(!response.ok)throw Error('status_'+response.status+':'+String(data?.error||'unknown'));
      return data;
    }catch(e){error=e;if(attempt===0)await new Promise(r=>setTimeout(r,600))}
  }
  throw error;
}
try{
  const delivery=await json(new URL('release-delivery.json',SITE));
  assert(/^[a-f0-9]{64}$/.test(delivery.architectureCatalogId||''),'missing_current_catalog');
  assert(Array.isArray(delivery.dois)&&new Set(delivery.dois.map(doi)).size===delivery.dois.length,
    'invalid_published_doi_membership');
  const catalogId=delivery.architectureCatalogId;
  const registry=await json(new URL('toc-demand-live.json',SITE));
  const summaryStore=await json(new URL('scheduled-article-summaries.json',SITE));
  const published=new Set(delivery.dois.map(doi));
  const summaries=new Set(Object.keys(summaryStore.items||{}).map(doi));
  const registryArticles=(registry.articles||[]).filter(x=>published.has(doi(x.doi)));
  const without=registryArticles.filter(x=>!summaries.has(doi(x.doi)));
  const picks=[
    ...without.filter(x=>!x.addedDate).slice(0,9),
    ...without.filter(x=>x.addedDate&&x.addedDate<'2026-10-01').slice(0,6),
    ...without.filter(x=>x.addedDate>='2026-10-01').slice(0,6),
  ];
  const unique=[...new Map(picks.map(x=>[doi(x.doi),x])).values()];
  const results=[],errors=[];
  let excerptProven=0,cardFallbackProven=0,reviewedProven=0;
  for(const article of unique){
    const id=doi(article.doi),q=new URLSearchParams({doi:id});
    try{
      const abs=await json(new URL('/api/literature/abstract?'+q,API));
      const card=await json(new URL('/api/user-ui/article-summary?'+q,API));
      assert(abs.doi===id&&card.doi===id,'cross_doi_summary');
      assert(abs.catalogId===catalogId,'stale_enrichment_catalog_generation');
      assert(abs.sourceSeparation===true,'source_separation_missing');
      assert(!Object.hasOwn(abs,'abstract'),'unlicensed_full_abstract_public');
      const excerpt=String(abs.abstractExcerpt||'');
      assert([...excerpt].length<=201,'abstract_excerpt_too_long');
      assert(!excerpt||/^https:\/\/doi.org\/10\./.test(abs.originalArticleUrl||''),
        'abstract_original_attribution_missing');
      if(abs.abstractAvailable&&excerpt){
        excerptProven++;
        if(card.available!==true){
          assert(card.abstractAvailable===true && card.abstractExcerpt===abs.abstractExcerpt,
            'summary_card_missing_metadata_excerpt');
          cardFallbackProven++;
        }
      }
      if(abs.basicSummaryZh||abs.basicSummaryEn){
        assert(Boolean(abs.basicSummaryZh)&&Boolean(abs.basicSummaryEn),
          'partial_bilingual_review_public');
        reviewedProven++;
      }
      results.push({doi:id,genre:!article.addedDate?'undated_record':
        article.addedDate<'2026-10-01'?'pre_oct':'oct_plus',
        abstractAvailable:Boolean(abs.abstractAvailable),
        source:abs.abstractSource||null,cardAvailable:Boolean(card.available),
        cardSource:card.source||null,cardExcerpt:Boolean(card.abstractExcerpt)});
    }catch(error){
      errors.push({doi:id,error:String(error?.message||error).slice(0,150)});
    }
  }
  assert(results.length>=Math.min(12,unique.length),'too_few_live_doi_samples');
  assert(excerptProven>=Math.min(5,results.length),'original_abstract_excerpt_not_available');
  assert(cardFallbackProven>=1,'metadata_only_card_fallback_not_demonstrated');
  report.catalogId=catalogId;
  report.registeredCount=published.size;
  report.knownApprovedSummaryRecords=summaries.size;
  report.checked=results.length;
  report.excerptProven=excerptProven;
  report.cardFallbackProven=cardFallbackProven;
  report.reviewedProven=reviewedProven;
  report.samples=results;
  report.failures=errors;
  // Metadata counts are verified via a separate admin-only route without
  // exposing the stored full source texts in logs or artifacts.
  if(TOKEN){
    const params=new URLSearchParams({catalogId});
    const coverage=await json(new URL('/api/admin/literature-basic-abstracts/coverage?'+params,API),true);
    const searchCoverage=await json(new URL('/api/admin/literature-search-enrichment/coverage?'+params,API),true);
    assert(Number(coverage.total)===published.size&&Number(searchCoverage.total)===published.size,
      'abstract_coverage_doi_count_mismatch');
    assert(Number(coverage.originalAbstracts)===Number(searchCoverage.originalAbstracts),
      'abstract_coverage_source_counter_disagreement');
    report.coverage={total:coverage.total,originalAbstracts:coverage.originalAbstracts,
      missingOriginalAbstracts:coverage.missingOriginalAbstracts,
      reviewedBilingualCandidates:coverage.reviewedBilingualCandidates,
      approvedDescriptions:searchCoverage.approvedDescriptions};
  }else{
    report.coverage={reason:'admin_token_unavailable'};
  }
  report.ok=true;report.checkedAt=new Date().toISOString();
}catch(error){
  report.error=String(error?.message||error).slice(0,240);
  report.failedAt=new Date().toISOString();
  process.exitCode=1;
}finally{
  await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  console.log('BASIC_ABSTRACT_LIVE_RESULT '+JSON.stringify({
    ok:report.ok,catalogId:report.catalogId,registeredCount:report.registeredCount,
    checked:report.checked,excerptProven:report.excerptProven,
    cardFallbackProven:report.cardFallbackProven,coverage:report.coverage,
    error:report.error,failures:report.failures?.slice(0,6)}));
}
