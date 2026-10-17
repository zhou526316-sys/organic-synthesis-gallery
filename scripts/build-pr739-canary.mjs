// PR #739 owner-only trial installer, generated after the normal bridge build.
// Never replace the production public/gallery-vpn-bridge.user.js or bump the
// production update channel as part of canary packaging.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const input='public/gallery-vpn-bridge.user.js';
const output='public/gallery-vpn-bridge-pr739-canary.user.js';
let body=await readFile(input,'utf8');
function exact(before,after,label){
  assert.equal(body.split(before).length,2,'Canary packaging anchor changed: '+label);
  body=body.replace(before,after);
}
assert.match(body,/^\/\/ @name\s+Organic Synthesis Gallery VPN Literature Bridge$/m);
assert.match(body,/^\/\/ @version\s+2\.2\.92$/m);
assert.match(body,/var VERSION = '6\.2\.20';/);
assert.match(body,/var CONTROLLER_REVISION = '2\.2\.41';/);
assert.match(body,/function recoveryProbePriority\(run,row\)/);
assert.match(body,/publisherHeartbeatQuarantine/);
assert.match(body,/owner_isolated_bridge_v2/);
assert.match(body,/organicGalleryCloudflareBridgeWriteToken/);
exact('// @version      2.2.92','// @version      2.2.93','userscript version');
exact("globalThis.__OSG_BRIDGE_VERSION__ = '2.2.92';","globalThis.__OSG_BRIDGE_VERSION__ = '2.2.93';",'bridge telemetry version');
exact("const ENGINE_REVISION = '6.2.73';","const ENGINE_REVISION = '6.2.74';",'PDF owner bridge handshake version');
exact("var INSTALL_REVISION = '6.2.73';","var INSTALL_REVISION = '6.2.74';",'capture installed version');
body=body.replaceAll('VPN Bridge 2.2.92','VPN Bridge 2.2.93');
// Remove only the trial build's metadata auto-update URLs, so the trial
// NEVER automatically fetches the live 2.2.92 production userscript.
// The same script namespace and name are retained: owners must REPLACE the
// existing install, not run two independently authorized collectors.
const before=body;
body=body.replace(/^\/\/ @updateURL\s+https:\/\/[^\r\n]+\r?\n/m,'')
  .replace(/^\/\/ @downloadURL\s+https:\/\/[^\r\n]+\r?\n/m,'');
assert.notEqual(body,before,'trial updater URLs must be removed');
assert.doesNotMatch(body,/^\/\/ @(?:updateURL|downloadURL)/m);
assert.match(body,/^\/\/ @version\s+2\.2\.93$/m);
assert.match(body,/var INSTALL_REVISION = '6\.2\.74';/);
assert.match(body,/const ENGINE_REVISION = '6\.2\.74';/);
assert.match(body,/^\/\/ @namespace\s+organic-synthesis-gallery$/m);
assert.doesNotMatch(body,/\beval\s*\(/);
assert.doesNotMatch(body,/(?:Bearer\s+[A-Za-z0-9_-]{20,}|BRIDGE_WRITE_TOKEN\s*=)/);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,body,'utf8');
console.log('TM_PR739_TRIAL_ARTIFACT '+JSON.stringify({
  output,bridgeVersion:'2.2.93',installRevision:'6.2.74',
  controllerRevision:'2.2.41',captureProtocol:'6.2.20',
  autoUpdater:'disabled',productionInstaller:'unchanged',
  requiresReplacingExistingBridge:true,bytes:Buffer.byteLength(body,'utf8')
}));
