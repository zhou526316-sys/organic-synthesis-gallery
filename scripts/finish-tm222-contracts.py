from pathlib import Path
# The exact error is present in the user's current Nature Figure 1/2 traces.
for name in ['public/toc-mainline.user.js','scripts/tm-auto-report.fragment.js']:
 p=Path(name);s=p.read_text()
 if 'extension_connection_denied' not in s:
  anchor="    if(status===401)return 'authentication_http_401';"
  assert s.count(anchor)==1
  s=s.replace(anchor,"    if(/Request was blocked by the user|Refused to connect.*blocked/i.test(m))return 'extension_connection_denied';\n"+anchor,1)
 p.write_text(s)
# Explicit origin already used by the supported Nature adapter. No permission bypass.
for name in ['public/toc-mainline.user.js','cloudflare/scripts/build-bridge-loader.mjs']:
 p=Path(name);s=p.read_text()
 if '// @connect      media.springernature.com' not in s:
  anchor='// @connect      acs.silverchair-cdn.com';assert s.count(anchor)==1
  s=s.replace(anchor,anchor+'\n// @connect      media.springernature.com',1)
 p.write_text(s)
p=Path('scripts/patch-tm221-window-guard.py');s=p.read_text()
if 'TM222_RETAINS_WINDOW_GUARDS' not in s:
 anchor="p=Path('public/toc-mainline.user.js');s=p.read_text()"
 assert s.count(anchor)==1
 s=s.replace(anchor,anchor+"\nif \"var CONTROLLER_REVISION = '2.2.22';\" in s:\n    assert all(x in s for x in ['requestControllerStart','previous_task_tab_not_closed','clearOwnedJob','await acquireLease()','assertBoundCaptureJob'])\n    print('TM222_RETAINS_WINDOW_GUARDS: run behavioral regression unchanged')\n    raise SystemExit(0)",1)
 p.write_text(s)
p=Path('.github/workflows/tm222-live-acceptance.yml');s=p.read_text()
s=s.replace("'BEGIN OSG_LIVE_PROGRESS_V1','captureLiveUpdate'","'BEGIN OSG_LIVE_PROGRESS_V1','BEGIN OSG_AUTO_REPORT_V1','enqueueCaptureReport','startAutomaticCaptureReports','diagnostic_receipt_invalid','extension_connection_denied','@connect      media.springernature.com','captureLiveUpdate'")
s=s.replace("panelPollSeconds:1,pollSource:","panelPollSeconds:1,diagnosticSendIntervalSeconds:10,diagnosticDelivery:'persistent local outbox and server receipt, not an always-running assistant',pollSource:")
p.write_text(s)
p=Path('scripts/test-tm222-auto-report.mjs');s=p.read_text()
if 'explicit extension denial differs from server 403' not in s:
 anchor="console.log('TM222_AUTO_REPORT_TEST_SUMMARY '"
 assert s.count(anchor)==1
 s=s.replace(anchor,"await test('explicit extension denial differs from server 403',()=>{const h=harness();assert.equal(h.api.autoReportCause({message:'gm_request_error:Refused to connect: Request was blocked by the user',httpStatus:0}),'extension_connection_denied');});\n"+anchor,1)
 p.write_text(s)
print('TM222_CONTRACTS_READY: preserved controller safeguards and explicit Nature CDN declaration')
