// Owner-private browser. The static shell is public; ALL data and writes are
// served only after canonical Worker verifies a live private_pdf_owner session.
const API='https://api.gczhouwld.com/api/user-ui/private-pdf/audit';
const SESSION='organic-gallery-session-v1';
const $=id=>document.getElementById(id);
let ownerSession='',after='',filter='all',q='',busy=false,hasMore=false;
let loaded=0;
const text=(tag,value,className='')=>{
 const node=document.createElement(tag);
 node.textContent=String(value??'');
 if(className)node.className=className;
 return node;
};
const status=s=>{$('notice').textContent=s;};
const iso=stamp=>stamp?new Date(Number(stamp)).toLocaleString('zh-CN',
 {timeZone:'Asia/Shanghai',hour12:false}):'未检查';
const number=v=>Number(v||0).toLocaleString('zh-CN');
function authenticated() {
 const current=localStorage.getItem(SESSION)||'';
 if(!current||current!==ownerSession) {
  status('当前会话已退出或切换。请返回 Gallery 登录管理员账号后刷新本页。');
  throw Error('session_changed');
 }
 return current;
}
async function api(url,init={}){
 const bearer=authenticated();
 const response=await fetch(url,{
  ...init,credentials:'omit',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(15000),
  headers:{authorization:'Bearer '+bearer,...(init.headers||{})},
 });
 let body={};
 try{body=await response.json();}catch{}
 if(!response.ok){
  if(response.status===401||response.status===403)
   throw Error(response.status===401?'请先在 Gallery 登录管理员账号。':'账号没有 private_pdf_owner 权限，无法访问全库验收报表。');
  throw Error('后台验收查询失败：HTTP '+response.status+' ('+
   String(body.error||'unknown').slice(0,75)+')');
 }
 return body;
}
function summaryRow(name,val) {
 const c=text('div','','metric');
 const label=text('span',name,'small muted');
 const num=text('strong',number(val));
 c.append(label,num);return c;
}
function drawSummary(report) {
 const s=report.summary||{};
 const metrics=[
  ['目录 DOI',s.total],['已入库 ready',s.ready],
  ['待处理',s.pending],['入库失败',s.failed],['PDF 缺失',s.missing],
  ['内容身份验证',s.identity_verified],
  ['R2 头尾通过',s.r2_head_tail_pass],
  ['R2 头尾失败',s.r2_head_tail_failed],
  ['管理员人工确认两页',s.owner_reported_browser_pass],
 ];
 $('summary').replaceChildren(...metrics.map(([name,val])=>summaryRow(name,val)));
 $('metadata').textContent='目录来源：'+String(report.sourceCommit||'').slice(0,12)+
   ' · 最近完整对齐：'+iso(report.completedAt)+
   ' · 预期 '+number(report.expectedCount)+' 篇 / 实际 '+number(s.total)+' 篇';
}
const inventoryLabel={ready:'已入库',pending:'待处理',failed:'入库失败',missing:'缺失'};
function makeRow(item) {
 const tr=document.createElement('tr');
 const identity=document.createElement('td');
 identity.append(text('div',item.doi,'doi'),
   text('div',item.journal,'small muted'),
   text('div',item.addedDate||'—','small muted'));
 const ready=document.createElement('td');
 ready.append(text('div',inventoryLabel[item.inventory]||item.inventory,
   item.inventory==='ready'?'pass':item.inventory==='failed'?'fail':'pending'));
 if(item.inventory==='ready')ready.append(
  text('div','字节：'+number(item.byteLength),'small muted'),
  text('div','内容身份：'+(item.identityVerified?'已验证':'未验证'),'small muted'),
  text('div','已知页数：'+number(item.pdfPages),'small muted'));
 const r2=document.createElement('td');
 r2.append(text('div',item.storageProbe==='pass'?'头尾检查通过':
     item.storageProbe==='fail'?'头尾检查失败':'未测试',
     item.storageProbe==='pass'?'pass':item.storageProbe==='fail'?'fail':'pending'),
   text('div',item.probeReason||'—','small muted'),
   text('div',iso(item.probedAt),'small muted'));
 const browser=document.createElement('td');
 browser.append(text('div',item.browser==='owner_reported_pass'?
  '管理员人工确认两页':'未实测两页',
  item.browser==='owner_reported_pass'?'pass':'pending'),
  text('div',iso(item.browserCheckedAt),'small muted'));
 const ops=document.createElement('td'),wrap=text('div','','actions');
 if(item.inventory==='ready'){
  const link=text('a','腾讯试读 ↗');
  link.href='/pdf/?doi='+encodeURIComponent(item.doi)+'&pdfIngress=tencent';
  link.target='_blank';link.rel='noopener noreferrer';
  wrap.append(link);
  const done=text('button','记录两页实测');
  done.type='button';
  done.addEventListener('click',async()=>{
   if(!confirm('请先亲自在已授权的浏览器里确认当前 DOI 的第一页、第二页确实显示，且上下滚动正常。这里只记录管理员人工确认，不代表所有网络通过。'))return;
   done.disabled=true;
   try {
    const response=await api(API+'/reading',{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({doi:item.doi,result:'two_pages_rendered'}),
    });
    if(response.classification!=='owner_reported_not_independent')throw Error('收据不匹配');
    item.browser='owner_reported_pass';item.browserCheckedAt=Date.now();
    browser.replaceChildren(text('div','管理员人工确认两页','pass'),
     text('div',iso(item.browserCheckedAt),'small muted'));
    status('已保存当前 DOI 的人工实测收据；不是全库自动通过。');
   }catch(error){status(String(error.message||error));}
   finally{done.disabled=false;}
  });
  wrap.append(done);
 }
 ops.append(wrap);tr.append(identity,ready,r2,browser,ops);
 return tr;
}
async function fetchPage(cursor) {
 const url=new URL(API);
 url.searchParams.set('limit','60');
 if(cursor)url.searchParams.set('after',cursor);
 if(filter!=='all')url.searchParams.set('status',filter);
 if(q)url.searchParams.set('q',q);
 return api(url.toString());
}
async function load(reset=false) {
 if(busy)return;
 busy=true;$('next').disabled=true;$('search').disabled=true;
 try {
  if(reset){after='';loaded=0;$('results').replaceChildren();}
  status('正在读取管理员验收结果…');
  const data=await fetchPage(after);
  if(data.ready===false){
   $('summary').replaceChildren(text('p','尚未完成首次全库目录对齐。请等待管理员定时任务或检查维护工作流。','muted'));
   $('results').replaceChildren(text('tr',''));
   $('metadata').textContent='';
   status('数据暂未生成；不能把“未验证”显示为通过。');
   return;
  }
  if(reset||loaded===0)drawSummary(data);
  $('results').append(...data.items.map(makeRow));
  if(reset&&data.items.length===0){
   const tr=document.createElement('tr'),td=text('td','没有符合条件的 DOI。','muted');
   td.colSpan=5;tr.append(td);$('results').append(tr);
  }
  loaded+=data.items.length;after=data.nextAfter||'';hasMore=data.hasMore;
  $('pageinfo').textContent='本次筛选已加载 '+number(loaded)+' 篇'+(hasMore?'，可加载更多':'，已到底');
  $('next').disabled=!hasMore;
  status('已连接管理员验收报表。逐篇的“R2 头尾”与“人工阅读”必须分别判断。');
 }catch(error){
  status(String(error.message||error));
  $('next').disabled=true;
 }finally{busy=false;$('search').disabled=false;}
}
async function exportCsv() {
 if(busy)return;
 busy=true;$('export').disabled=true;
 let cursor='',rows=[],rounds=0;
 const snapshot=ownerSession;
 try{
  status('正在导出本次筛选的 DOI 元数据（不含 PDF 或授权票据）…');
  do{
   if(localStorage.getItem(SESSION)!==snapshot)throw Error('会话已改变，停止导出');
   const data=await fetchPage(cursor);
   if(!data.ready)throw Error('验收数据尚未就绪');
   rows.push(...data.items);
   cursor=data.nextAfter||'';
   rounds++;
   if(rounds>400)throw Error('导出超过安全分页上限，请缩小筛选范围');
  }while(cursor);
  const columns=['DOI','Journal','AddedDate','Inventory','IdentityVerified','R2HeadTail','R2Reason',
   'R2CheckedAt','OwnerTwoPageCheck','BrowserCheckedAt'];
  const cell=value=>{
   let s=String(value??'');
   if(/^[=+@\-]/.test(s))s="'"+s; // avoid spreadsheet formula injection
   return '"'+s.replaceAll('"','""')+'"';
  };
  const lines=[columns.map(cell).join(',')];
  for(const row of rows)lines.push([
   row.doi,row.journal,row.addedDate,row.inventory,row.identityVerified,row.storageProbe,
   row.probeReason,iso(row.probedAt),row.browser,iso(row.browserCheckedAt),
  ].map(cell).join(','));
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download='gallery-pdf-owner-audit.csv';
  document.body.append(anchor);anchor.click();anchor.remove();
  URL.revokeObjectURL(url);
  status('已导出 '+number(rows.length)+' 篇。本 CSV 仅供管理员本地保存。');
 }catch(error){status(String(error.message||error));}
 finally{busy=false;$('export').disabled=false;}
}
$('search').addEventListener('click',()=>{
 filter=$('filter').value;q=$('query').value.trim().toLowerCase();void load(true);
});
$('query').addEventListener('keydown',event=>{
 if(event.key==='Enter')$('search').click();
});
$('next').addEventListener('click',()=>{if(hasMore)void load(false);});
$('export').addEventListener('click',()=>{void exportCsv();});
try{
 ownerSession=localStorage.getItem(SESSION)||'';
 if(!ownerSession){status('请先在 Gallery 登录 private_pdf_owner 管理员账号，然后重新打开此页。');}
 else void load(true);
}catch{status('无法读取当前登录会话，请返回 Gallery 登录后再试。');}
