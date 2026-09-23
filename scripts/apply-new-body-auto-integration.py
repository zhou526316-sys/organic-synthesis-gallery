"""One-time feature-branch integration; no storage, publication or literature writes."""
from pathlib import Path

def patch(name,old,new):
 p=Path(name);s=p.read_text()
 if new in s:return
 assert s.count(old)==1,(name,s.count(old),old[:100])
 p.write_text(s.replace(old,new,1))

patch('cloudflare/scripts/merge-reviewed-body.mjs',"export function verifyReviewedBody(item,bytes){\n const doi=normalizeDoi(item.doi);\n demand(doi&&item.approved===true&&item.role==='article_figure','body_approval_required');", "export function verifyReviewedBody(item,bytes){\n demand(item.approved===true,'body_approval_required');\n return verifyBodyFile(item,bytes);\n}\n// File/identity checks are reusable; this function does NOT grant human review approval.\nexport function verifyBodyFile(item,bytes){\n const doi=normalizeDoi(item.doi);\n demand(doi&&item.role==='article_figure','body_approval_required');")
patch('cloudflare/scripts/new-body-auto-validation.mjs',"[[owners,row.sha256||row.contentHash,row.doi]", "[[owners,String(row.sha256||row.contentHash||'').slice(0,32),key]")
patch('cloudflare/scripts/new-body-auto-validation.mjs',"const raw=atob(data);const xml=", "const raw=new TextDecoder().decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));const xml=")
patch('cloudflare/scripts/merge-new-body-auto.mjs',"requireBody(previous.policyId===POLICY_ID&&Array.isArray(previous.items)&&previous.items.length<=2000,'auto_previous_snapshot_invalid');", "requireBody(previous.policyId===POLICY_ID&&Array.isArray(previous.items)&&previous.items.length<=2000&&(!priorBytes||previous.count===previous.items.length),'auto_previous_snapshot_invalid');\n  requireBody(new Set(previous.items.map(x=>x.record.doi+'|'+x.record.id)).size===previous.items.length,'auto_previous_duplicate_identity');")
patch('.github/workflows/github-pages.yml',"on:\n  workflow_dispatch:","on:\n  workflow_call:\n  workflow_dispatch:")
patch('.github/workflows/github-pages.yml',"      - 'cloudflare/scripts/merge-curated-pages.mjs'", "      - 'cloudflare/scripts/merge-curated-pages.mjs'\n      - 'cloudflare/scripts/new-body-auto-validation.mjs'\n      - 'cloudflare/scripts/merge-new-body-auto.mjs'\n      - 'audit/media-auto-policy.json'")
patch('.github/workflows/github-pages.yml',"      - name: Sanitize invalid static media", "      - name: Independently validate and publish newly marked body captures\n        run: |\n          npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund playwright@1.55.1\n          npx playwright install --with-deps chromium\n          node cloudflare/scripts/merge-new-body-auto.mjs\n      - name: Preserve automatic media validation evidence\n        if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: new-body-auto-validation\n          path: |\n            public/auto-body-status.json\n            public/auto-body-publication.json\n          retention-days: 14\n          if-no-files-found: warn\n      - name: Sanitize invalid static media")

p=Path('docs/body-media-publication.md');text=p.read_text()
heading='## New marked ACS fast path — 2026-09-23 amendment'
if heading not in text:
 text+='''\n\n## New marked ACS fast path — 2026-09-23 amendment

The user requested that newly captured images not wait for historical-image forensics. This media-only amendment adds a SEPARATE automated-provenance publication authority for eligible NEW ACS body images. It does not change or fake any explicit human `review.decision` used by the existing reviewed-batch builder.

The storage marker still says `pending_review` and is not sufficient by itself. The new build step independently verifies current generation, task/page/source DOI binding, exact canonical server marker, permitted full-article/CDN body-asset paths, individual Figure/Scheme label and caption, object-address identity, actual stored SHA256/size/type, duplicate identities/hashes and isolated browser image decoding. Only current-corpus ACS records passing every check may be added. TOC/Visual Abstract roles, old or unmarked captures, opaque URLs, held scope rechecks and same-ID replacements remain outside this fast path. Invalid individual records do not block other eligible new images.

Automatic entries are labelled `automated_provenance_bytes_and_decode` and `individualSemanticReview:false`. This is not a claim of per-image semantic/visual review, maximum publisher resolution or complete article inventory. The original individually reviewed ledger remains truthful. New auto-publication records are separate from storage and are appended to the deployed ledger only after actual file validation. No image bytes are modified, upscaled, deleted, or fetched anew from a publisher.

A lightweight repository schedule checks every fifteen minutes at UTC minutes7/22/37/52. Only unseen eligible captures cause the existing Pages workflow to run through its UNCHANGED literature_authorization job. The repository job is not a new ChatGPT monitoring task and does not replace the existing hourly exception-review task. GitHub scheduling may be delayed. At most five newly affected papers/thirty images are admitted per build; the current ten-thumbnail card limit is respected instead of claiming invisible extra images are displayed.

Each build revalidates and preserves the previous published auto snapshot and exact image bytes. Failed new downloads are recorded with bounded retry timing. An unavailable/corrupt prior published snapshot fails closed rather than silently erasing previously displayed auto files. Disabling new admission does not erase prior valid images. Old sealed media remains in its separate reviewed restoration path. Live acceptance must still establish public URLs/hashes/labels and actual cards; a successful prepublication check alone is not postdeployment verification.
'''
 p.write_text(text)
print('NEW_BODY_AUTO_INTEGRATION: existing manual approvals and literature authorization retained; publisher fetches=0')
