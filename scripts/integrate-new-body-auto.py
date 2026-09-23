"""Add a media-only polling preflight and validated build step; retain release gates."""
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
    needs: new_body_preflight
    if: ${{ !cancelled() && (github.event_name != 'schedule' || (needs.new_body_preflight.result == 'success' && needs.new_body_preflight.outputs.changed == 'true')) }}
    runs-on: ubuntu-latest''')
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
assert "node scripts/validate-pages-literature-authorization.mjs" in s
assert "needs: [literature_authorization, build]" in s and "MEDIA_REBUILD_LOCKDOWN: '1'" in s
p.write_text(s)
# Compare stable inventory identities, not build timestamps, so unchanged failures do not rebuild every poll.
p=Path('cloudflare/scripts/merge-new-body-auto.mjs');t=p.read_text()
t=t.replace('published:live.generatedAt','published:Object.entries(live.items||{}).flatMap(([d,x])=>(x.figures?.figures||[]).map(f=>[d,f.id,f.verifiedSha256||f.contentHash||f.imageUrl])).sort()')
t=t.replace('await checkNewBodyIdentity(row,policy,corpus,held);requireBody(old.imageUrl', 'await checkNewBodyIdentity(row,{...policy,enabled:true},corpus,held);requireBody(old.imageUrl')
p.write_text(t)
p=Path('docs/body-media-publication.md');t=p.read_text()
header='## New ACS body-image automatic path — user-authorized 2026-09-23'
if header not in t:
 t+='''\n\n'''+header+'''

This amendment separates NEW captured body media from historical recovery. The existing explicit human-review contract above remains unchanged for old sealed files, opaque publisher sources, same-ID replacements and all non-enabled publisher profiles. New-image machine decisions are NOT written as human `review.decision=approved`, and storage markers keep `semanticReview=not_reviewed`.

The gated GitHub Pages build may now publish NEW ACS files under `shared/new-body-auto-policy.json` after independent checks: current corpus and scope holds; actual server marker and recomputed canonical evidence; exact page/source/task DOI; article-scoped ACS CDN filename; a same-job report tying isolated body-caption discovery to the exact upload start and completed R2 object; actual SHA256; safe SVG or PNG decoding; no cross-DOI hash/source conflicts; and a second stage-index consistency check. Missing reports, unmarked historical captures, ambiguous roles and corrupt files are held individually, never automatically relabelled as approved.

Every image carries `source=machine-validated-new-capture` and a separate machine-validation receipt. The new public `new-body-auto-ledger.json` and `new-body-auto-status.json` are distinct from the existing HUMAN-approved publication ledger. A machine check establishes consistency, provenance and decodability, not an independent visual/semantic judgment or maximum image resolution. Existing human-reviewed files and every TOC remain unchanged. Same-ID replacement and more than ten shown body figures per card stay outside this first profile.

The Pages workflow checks at minutes 7/22/37/52. A schedule preflight reads only inventories and skips builds when no eligible input changes. A new build is limited to five articles/thirty files; previous exact machine-validated public copies are retained and rehashed. All existing literature_authorization checks still execute before any build/deploy; neither literature data nor 08:00/18:00 release times change. Actual GitHub scheduling can be delayed; this is not a guaranteed fifteen-minute delivery SLA.

All acquisition still belongs to Tampermonkey/VPN Bridge. This path only reads already-stored R2 objects and immutable reports, never publisher pages. It never deletes or updates staging, performs direct import, clears quarantine, or modifies capture timestamps. Failed builds retain the previously deployed site. A deployment must be followed by public byte/ledger and bounded browser acceptance, separately reported from the storage marker.

Bridge 2.2.23 remains compatible. Its staged receipt describes the upload transaction and is not rewritten when a later static publication occurs. The publication ledger—not a stored `published=false` flag—answers whether a specific copy is now live. No new client installer is required for this server/build feature.
'''
 p.write_text(t)
print('Integrated media-only new-body path; literature gates retained; no data or storage writes.')
