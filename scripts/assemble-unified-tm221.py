"""Reconcile the eight inspected #135/#136 conflicts on an exact main-derived integration branch.
No publisher requests, production media mutations or literature input changes.
"""
from pathlib import Path
import subprocess,json
PIN='2e2aa23e99434ced71e285250f5e8269cb60fbd8'
EXPECTED={'.github/workflows/github-pages.yml','.github/workflows/toc-publisher-adapters-ci.yml','cloudflare/scripts/build-bridge-loader.mjs','cloudflare/worker/src/local-captures.js','public/toc-demand-live.json','public/toc-mainline.user.js','scripts/test-media-identity-v220.mjs','scripts/test-tm-paired-capture.mjs'}
def git(*args):return subprocess.check_output(['git',*args]).decode().strip()
assert git('branch','--show-current')=='integration/tm220-final-unified'
assert "var VERSION = '6.2.20';" in Path('public/toc-mainline.user.js').read_text()
result=subprocess.run(['git','merge','--no-commit','--no-ff',PIN],capture_output=True,text=True)
conflicts=set(git('diff','--name-only','--diff-filter=U').splitlines())
assert conflicts==EXPECTED, json.dumps({'unexpectedConflicts':sorted(conflicts),'mergeOutput':result.stdout[-2000:]})
# These exact differences were inspected from all three stages in run35756658596.
# The consolidated implementation retains checkpoints/retries, adds persistent-tab binding,
# actual-byte publication and a capability handshake on an existing public endpoint.
for name in sorted(conflicts):
    Path(name).write_bytes(subprocess.check_output(['git','show',':3:'+name]))
    subprocess.check_call(['git','add',name])
assert not git('ls-files','-u')
assert 'needs: literature_authorization' in Path('.github/workflows/github-pages.yml').read_text()
assert 'node scripts/validate-pages-literature-authorization.mjs' in Path('.github/workflows/github-pages.yml').read_text()
changed=git('diff','--name-only','HEAD').splitlines()
allowed_public={'public/toc-mainline.user.js','public/toc-demand-live.json','public/capture-launch.html'}
assert all(not n.startswith('public/') or n in allowed_public for n in changed),changed
# No duplicate live contract for the earlier staging-only build.
old=Path('.github/workflows/tm220-live-validation.yml')
if old.exists():old.unlink()
# Forward-only release number avoids publishing two incompatible scripts as 2.2.20.
versioned=[
 'public/toc-mainline.user.js','cloudflare/scripts/build-bridge-loader.mjs',
 'cloudflare/scripts/build-live-toc-demand-queue.mjs','cloudflare/worker/src/local-captures.js',
 'cloudflare/worker/src/index.js','cloudflare/worker/src/verified-browser-media.js',
 'scripts/validate-tm-release.mjs','scripts/test-media-identity-v220.mjs',
 'scripts/test-tm-stage-first.mjs','scripts/test-tm-night-release.mjs',
 'scripts/test-tm-paired-capture.mjs','scripts/test-tm-night-browser.mjs',
 '.github/workflows/github-pages.yml','.github/workflows/toc-publisher-adapters-ci.yml',
 '.github/workflows/tm-night-live-acceptance.yml']
for name in versioned:
    p=Path(name)
    if p.exists():p.write_text(p.read_text().replace('6.2.20','6.2.21').replace('2.2.20','2.2.21'))
# The old dedicated capability endpoint must not contradict the new verified-publication intake.
p=Path('cloudflare/worker/src/index.js');text=p.read_text()
text=text.replace("mode:'verified-staging'","mode:'verified-browser-publication'").replace("mode: 'verified-staging'","mode: 'verified-browser-publication'")
text=text.replace('publishedAutomatically:false','publishedAutomatically:true').replace('publishedAutomatically: false','publishedAutomatically: true')
p.write_text(text)
# Retain the existing XML entity/CSS hardening from the deployed staging intake as well.
p=Path('cloudflare/worker/src/verified-browser-media.js');text=p.read_text()
needle="function svgInfo(bytes) {\n  const text=new TextDecoder().decode(bytes);"
assert needle in text
text=text.replace(needle,needle+"\n  if (/&#(?:x[0-9a-f]+|\\d+);|\\\\/i.test(text)) throw new Error('svg_encoded_reference_rejected');",1)
p.write_text(text)
# Put exact release workflow proposals in ordinary blobs. An authorized connector applies
# these later; a workflow token never edits workflow definitions or circumvents gates.
out=Path('audit/tm221-release-contracts');out.mkdir(parents=True,exist_ok=True)
for name in ['github-pages.yml','toc-publisher-adapters-ci.yml','tm-night-live-acceptance.yml']:
    (out/name).write_text(Path('.github/workflows',name).read_text())
(out/'operations.json').write_text(json.dumps({'delete':['.github/workflows/tm220-live-validation.yml'],'update':['.github/workflows/'+n for n in ['github-pages.yml','toc-publisher-adapters-ci.yml','tm-night-live-acceptance.yml']]},indent=2))
# All functional merged changes become a normal main-derived integration commit, not a
# history rewrite. Resetting the index preserves the reviewed working-tree merge.
subprocess.check_call(['git','reset','--mixed','HEAD'])
subprocess.check_call(['git','restore','--source=HEAD','--worktree','--','.github/workflows'])
print('UNIFIED_TM221_ASSEMBLED '+json.dumps({'source':PIN,'resolvedConflicts':sorted(conflicts),'captureVersion':'6.2.21','productionMediaWrites':0,'quarantineCutoverUnchanged':1790082000000}))
