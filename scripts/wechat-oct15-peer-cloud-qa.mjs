// Extend the established cloud verifier without overwriting the historical R1 report.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const request=JSON.parse(await readFile('audit/automation-triggers/wechat-oct15-cloud-readback.json','utf8'));
const receipt=JSON.parse(await readFile('audit/wechat-publisher/latest.json','utf8'));
const gate=JSON.parse(await readFile('audit/wechat-working/2026-10-15-review-gate.json','utf8'));
if(request.revision!=='2026-10-15-r2-peer-reviewed'||gate.revision!==request.revision)throw Error('Wrong peer-review revision');
if(!request.previousMediaId||receipt.media_id===request.previousMediaId||receipt.source_media_id!==request.previousMediaId)throw Error('Must verify a genuinely new draft, not the prior published/deleted media');
let code=await readFile('scripts/wechat-oct15-cloud-qa.mjs','utf8');
function replaceOnce(a,b){if(code.split(a).length!==2)throw Error('Verifier source changed: '+a);code=code.replace(a,b);}
replaceOnce("const dir='audit/wechat-working/2026-10-15-r1-cloud-readback';","const dir='audit/wechat-working/2026-10-15-r2-peer-cloud-readback';");
replaceOnce("['draft_add','draft_update'].includes(receipt.stage)","['draft_recreate_add','draft_recreate_resumed'].includes(receipt.stage)");
replaceOnce("revision:'2026-10-15-r1'","revision:'2026-10-15-r2-peer-reviewed'");
replaceOnce('m.sections.flatMap(s=>s.paragraphs)','m.sections.flatMap(s=>[...s.paragraphs,...[\'warning\',\'review\',\'callout\'].filter(k=>s[k]).map(k=>s[k])])');
replaceOnce("[0,'nature-diazo','重氮化合物单独失败']","[0,'nature-diazo','重氮物与 PPh₃'],[0,'nature-peer-practical','放大与一锅法'],[0,'nature-peer-final','概念原创性']");
replaceOnce("result.checks.titles=facts.titles;", "if(!facts.texts[0].includes('审稿人1')||!facts.texts[0].includes('审稿人2')||!facts.texts[0].includes('第二轮')||!facts.texts[1].includes('不代表审稿人意见'))throw Error('Required peer-review distinction missing'); result.checks.titles=facts.titles;");
const temp=resolve('scripts/.oct15-peer-cloud-verifier.generated.mjs');
await writeFile(temp,code);
try{await import(pathToFileURL(temp).href);}finally{await unlink(temp);}
