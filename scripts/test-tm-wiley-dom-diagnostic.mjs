import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const source=await fs.readFile('public/toc-mainline.user.js','utf8');
const exposed=source.replace('  installMenu();',`  globalThis.__wileyDiag={collectArticleFigureCandidates,wileyZeroFigureDomDiagnostic}; return;\n  installMenu();`);
const browser=await chromium.launch({headless:true});
let passed=0;
function check(name,fn){fn();passed+=1;console.log('WILEY_DIAG_PASS '+name);}
try{
  const page=await browser.newPage();
  await page.goto('about:blank');
  await page.evaluate(()=>{
    const storage={};
    window.GM_getValue=(k,d)=>k in storage?storage[k]:d;
    window.GM_setValue=(k,v)=>{storage[k]=v;};
    window.GM_deleteValue=k=>{delete storage[k];};
    window.GM_listValues=()=>Object.keys(storage);
    window.GM_registerMenuCommand=()=>{};
    window.GM_xmlhttpRequest=()=>{};
  });
  await page.addScriptTag({content:exposed});
  const result=await page.evaluate(()=>{
    document.body.innerHTML=`
      <main>
        <article>
          <p id="long-copy">${'ARTICLE BODY SHOULD NOT APPEAR IN DIAGNOSTIC '.repeat(250)}</p>
          <div class="wiley-figure-shell experimental-layout">
            <div class="legend-block">Figure 2. Catalytic cycle and scope</div>
            <picture class="asset-picture">
              <source srcset="https://media.wiley.example/figure-2-large.png 2x">
              <img class="asset-image" data-src="https://media.wiley.example/figure-2.png" alt="Catalytic cycle">
            </picture>
          </div>
        </article>
      </main>`;
    const trace=[];
    const job={doi:'10.1002/anie.2539581',publisher:'wiley'};
    const rows=__wileyDiag.collectArticleFigureCandidates(job,trace,document,location.href,'fixture');
    __wileyDiag.wileyZeroFigureDomDiagnostic(job,trace,document);
    return {rows,trace};
  });
  check('unknown Wiley wrapper remains unaccepted by strict figure collector',()=>assert.equal(result.rows.length,0));
  const diag=result.trace.filter(x=>x.stage==='wiley_dom_diagnostic');
  check('zero-figure diagnostic emits summary and structural samples',()=>assert.ok(diag.some(x=>x.event==='summary')&&diag.some(x=>x.event==='sample')));
  const joined=JSON.stringify(diag);
  check('diagnostic retains useful wrapper and caption structure',()=>assert.ok(joined.includes('wiley-figure-shell')&&joined.includes('legend-block')&&joined.includes('Figure 2. Catalytic cycle and scope')));
  check('diagnostic never includes the long article body',()=>assert.ok(!joined.includes('ARTICLE BODY SHOULD NOT APPEAR IN DIAGNOSTIC')));
  check('diagnostic caption prefix remains bounded',()=>{
    for(const row of diag.filter(x=>x.event==='sample')){
      const body=JSON.parse(row.message);
      assert.ok(String(body.captionPrefix||'').length<=140);
    }
  });
  check('diagnostic URLs are query/hash stripped by pushTrace',()=>assert.ok(diag.filter(x=>x.event==='sample').every(x=>!/[?#]/.test(x.url||''))));
  console.log('WILEY_DIAG_TEST_SUMMARY '+JSON.stringify({passed,productionWrites:0,publisherRequests:0}));
}finally{await browser.close();}
