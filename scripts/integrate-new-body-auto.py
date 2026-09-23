"""Add media-only preflight and validated build steps while retaining authorization."""
from pathlib import Path
p=Path('.github/workflows/github-pages.yml');s=p.read_text()
def replace_once(old,new):
 global s
 if new in s:return
 assert s.count(old)==1,old[:100]
 s=s.replace(old,new,1)
replace_once('on:\n  workflow_dispatch:',"on:\n  schedule:\n    - cron: '7,22,37,52 * * * *'\n  workflow_dispatch:")
replace_once("      - 'PAGES_REFRESH'","      - 'PAGES_REFRESH'\n      - 'shared/new-body-auto-policy.json'\n      - 'cloudflare/scripts/new-body-auto-validation.mjs'\n      - 'cloudflare/scripts/merge-new-body-auto.mjs'\n      - 'scripts/decode-new-body-image.py'")
replace_once('jobs:\n  literature_authorization:\n    runs-on: ubuntu-latest', '''jobs:
  new_body_preflight:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    outputs:
      changed: ${{ steps.check.outputs.changed }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.sha }}
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - id: check
        name: Check new marked body evidence without writing media
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: node cloudflare/scripts/merge-new-body-auto.mjs --preflight
  literature_authorization:
    runs-on: ubuntu-latest
    needs: new_body_preflight
    if: ${{ !cancelled() && (github.event_name != 'schedule' || (needs.new_body_preflight.result == 'success' && needs.new_body_preflight.outputs.changed == 'true')) }}''')
replace_once('  build:\n    needs: literature_authorization\n    runs-on:',"  build:\n    needs: literature_authorization\n    if: ${{ !cancelled() && needs.literature_authorization.result == 'success' }}\n    runs-on:")
replace_once('    needs: [literature_authorization, build]\n    steps:',"    needs: [literature_authorization, build]\n    if: ${{ !cancelled() && needs.literature_authorization.result == 'success' && needs.build.result == 'success' }}\n    steps:")
replace_once('      - name: Sanitize invalid static media','''      - name: Validate and merge only eligible new ACS body images
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          python3 -m pip install --disable-pip-version-check --quiet Pillow==11.3.0 CairoSVG==2.8.2 defusedxml==0.7.1
          node cloudflare/scripts/merge-new-body-auto.mjs
      - name: Preserve machine body publication evidence
        uses: actions/upload-artifact@v4
        with:
          name: new-body-auto-build
          path: |
            public/new-body-auto-status.json
            public/new-body-auto-ledger.json
          retention-days: 14
      - name: Sanitize invalid static media''')
assert 'literature_authorization:\n    runs-on: ubuntu-latest' in s
assert 'node scripts/validate-pages-literature-authorization.mjs' in s
assert 'needs: [literature_authorization, build]' in s and "MEDIA_REBUILD_LOCKDOWN: '1'" in s
p.write_text(s)
p=Path('cloudflare/scripts/merge-new-body-auto.mjs');t=p.read_text()
t=t.replace('published:live.generatedAt','published:Object.entries(live.items||{}).flatMap(([d,x])=>(x.figures?.figures||[]).map(f=>[d,f.id,f.verifiedSha256||f.contentHash||f.imageUrl])).sort()')
t=t.replace('await checkNewBodyIdentity(row,policy,corpus,held);requireBody(old.imageUrl','await checkNewBodyIdentity(row,{...policy,enabled:true},corpus,held);requireBody(old.imageUrl')
t=t.replace(r'reports\/[a-f0-9]{28}',r'reports\/[a-f0-9]{32}')
p.write_text(t)
p=Path('docs/body-media-publication.md');t=p.read_text();header='## New ACS body-image automatic path — user-authorized 2026-09-23'
if header not in t:
 t+='\n\n'+header+'''

This amendment separates NEW captured body media from historical recovery. The existing explicit human-review contract remains unchanged for old sealed files, opaque publisher sources, same-ID replacements and non-enabled publisher profiles. New machine decisions are NOT written as human `review.decision=approved`; storage markers retain `semanticReview=not_reviewed`.

The gated Pages build may publish new ACS files under `shared/new-body-auto-policy.json` after current-corpus and scope checks; server marker and recomputed canonical evidence; exact page/source/task DOI; article-scoped CDN filename; same-job report binding isolated body-caption discovery to exact upload start and completed R2 object; actual SHA256 and safe decoding; cross-DOI conflict checks; and final stage-index consistency verification. Missing evidence is held per image, not converted into approval.

Separate `new-body-auto-ledger.json` and `new-body-auto-status.json` identify machine-validated copies. The existing human-reviewed ledger is unchanged. Machine validation establishes consistency, provenance and decodability, not independent visual/semantic judgment or maximum resolution. Existing TOCs and same-ID published images are preserved; more than ten figures per card remain outside this initial profile.

The media-only schedule checks at minutes 7/22/37/52. No-change preflight skips builds. Each build processes at most five articles/thirty new files and carries forward exact previously validated copies. All literature_authorization tests and checks remain mandatory; no corpus input or 08:00/18:00 literature release time changes. The schedule is not a guaranteed fifteen-minute delivery SLA.

Acquisition remains Tampermonkey/VPN Bridge only: this feature reads stored R2 objects/reports, never publisher pages. It does not write/delete staging, import/repair media directly, reopen quarantine or rewrite capture timestamps. Failed builds retain the prior deployed site. Live byte/ledger and bounded browser verification are separate from a successful storage receipt.

Bridge 2.2.23 remains compatible and requires no reinstall. A historical staged receipt describes that upload transaction, while the later publication ledger identifies what is now live. This is an application publishing schedule, not a permanently running assistant code-repair service.
'''
 p.write_text(t)
print('Integrated media-only automatic path; original authorization assertions remain unchanged.')
