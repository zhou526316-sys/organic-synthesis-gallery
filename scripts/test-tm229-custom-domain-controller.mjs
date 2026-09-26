import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/toc-mainline.user.js','utf8');
let passed=0;
function check(name,fn){fn();passed+=1;console.log('TM229_DOMAIN_PASS '+name);}

check('standalone metadata matches custom domain and updates from it',()=>{
  assert.match(source,/^\/\/ @match\s+https:\/\/gallery\.gczhouwld\.com\/\*$/m);
  assert.match(source,/^\/\/ @updateURL\s+https:\/\/gallery\.gczhouwld\.com\/toc-mainline\.user\.js$/m);
  assert.match(source,/^\/\/ @downloadURL\s+https:\/\/gallery\.gczhouwld\.com\/toc-mainline\.user\.js$/m);
});

check('controller revision advances without protocol migration',()=>{
  assert.ok(source.includes("var VERSION = '6.2.20';"));
  assert.ok(source.includes("var CONTROLLER_REVISION = '2.2.35';"));
});

const names=['GALLERY_HOST','GALLERY_PATH','LEGACY_GALLERY_HOST','LEGACY_GALLERY_PATH','PAGES_GALLERY_HOST'];
const declarations=names.map(name=>{
  const m=new RegExp("var "+name+" = '([^']+)';").exec(source);
  assert.ok(m,'missing '+name);
  return "var "+name+" = "+JSON.stringify(m[1])+";";
}).join('\n');
const start=source.indexOf('  function isGalleryPage()');
const end=source.indexOf('\n\n  function badge(',start);
assert.ok(start>0&&end>start,'isGalleryPage block missing');
const fnSource=source.slice(start,end);

function run(hostname,pathname){
  const context=vm.createContext({location:{hostname,pathname}});
  vm.runInContext(declarations+'\n'+fnSource,context);
  return vm.runInContext('isGalleryPage()',context);
}

check('custom domain is the primary Gallery controller',()=>{
  assert.equal(run('gallery.gczhouwld.com','/'),true);
  assert.equal(run('gallery.gczhouwld.com','/?doi=ignored'),true);
});

check('legacy GitHub Pages project path remains compatible',()=>{
  assert.equal(run('zhou526316-sys.github.io','/organic-synthesis-gallery/'),true);
  assert.equal(run('zhou526316-sys.github.io','/organic-synthesis-gallery/index.html'),true);
  assert.equal(run('zhou526316-sys.github.io','/other-project/'),false);
});

check('Cloudflare Pages mirror remains compatible',()=>{
  assert.equal(run('organic-synthesis-gallery-public.pages.dev','/'),true);
});

check('unrelated publisher pages are never treated as Gallery controller',()=>{
  for(const host of ['pubs.acs.org','onlinelibrary.wiley.com','www.nature.com']) assert.equal(run(host,'/'),false);
});

check('manual controller start opens custom domain when invoked elsewhere',()=>{
  assert.ok(source.includes("window.open('https://'+GALLERY_HOST+GALLERY_PATH,'_blank')"));
  assert.ok(source.includes("var GALLERY_HOST = 'gallery.gczhouwld.com';"));
  assert.ok(source.includes("var GALLERY_PATH = '/';"));
});

check('2.2.28 skip-and-continue behavior is retained',()=>{
  for(const reason of ['bound_publisher_heartbeat_missing','task_tab_handle_unavailable','previous_task_tab_not_closed','controller_timeout']) assert.ok(source.includes(reason));
  assert.ok(source.includes("badge('已跳过 '"));
  assert.ok(source.includes("controller_lease_lost|another_task_still_active|capture_server_upgrade_pending"));
});

console.log('TM229_DOMAIN_TEST_SUMMARY '+JSON.stringify({passed,captureProtocol:'6.2.20',controllerRevision:'2.2.35',primaryGallery:'https://gallery.gczhouwld.com/'}));
