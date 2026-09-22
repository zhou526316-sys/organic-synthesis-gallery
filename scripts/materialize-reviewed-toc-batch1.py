"""Prepare the reviewed TOC-only recovery bundle. No Worker/D1/R2 writes or publisher fetches."""
import hashlib, io, json, os, pathlib, re, urllib.parse, urllib.request, zipfile

ARTIFACT_ID = 10699805219
ARCHIVE_SHA256 = '2fccf89bc0b92f6f0fbe933630fd80cd78024f820be5710314454dba8fa41b09'
# Explicit review decisions following contact-sheet examination of all 85 accepted images.
# 003/021/036 have numbered Scheme/Figure captions conflicting with official-TOC role.
# 063/064/091/092/093 are outside the reviewed local-official subset.
APPROVED_IDS = {f'image-{n:03d}' for n in range(1, 91)} - {'image-003','image-021','image-036','image-063','image-064'}
assert len(APPROVED_IDS) == 85
ROOT = pathlib.Path('.')
OUT = ROOT / 'audit/media-recovery'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

class OriginBoundRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if result is not None and urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            result.remove_header('Authorization')
        return result

opener = urllib.request.build_opener(OriginBoundRedirect())
request = urllib.request.Request('https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/' + str(ARTIFACT_ID) + '/zip', headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
with opener.open(request, timeout=45) as response:
    raw = response.read(18000001)
assert len(raw) <= 18000000 and hashlib.sha256(raw).hexdigest() == ARCHIVE_SHA256, 'Frozen evidence archive changed'
z = zipfile.ZipFile(io.BytesIO(raw))
verification = json.loads(z.read('verification.json'))
rows = [r for r in verification['images'] if r['reviewId'] in APPROVED_IDS]
assert len(rows) == 85 and {r['reviewId'] for r in rows} == APPROVED_IDS
items = []
for row in rows:
    assert row['sample'] == 'old93' and row['store'] == 'local' and row['kind'] == 'official'
    assert row['classification'] == 'dual_url_match_candidate' and not row['foreignDois']
    assert row['storedHashMatchesBytes'] is True and row['byteStatus'] == 'verified'
    caption = str(row.get('storedCaption') or '')
    assert re.search(r'Visual\s*Abstract|Graphical\s*Abstract', caption, re.I)
    assert not re.match(r'^(?:Scheme|Figure)\s*\d', caption, re.I)
    data = z.read(row['file'])
    digest = hashlib.sha256(data).hexdigest()
    assert digest == row['computedSha256'] and digest.startswith(row['contentHash'])
    assert 100 <= len(data) <= 4000000
    ext = row['actualType']
    assert ext in ('svg', 'png')
    destination = ASSETS / (digest + '.' + ext)
    destination.write_bytes(data)
    items.append({
        'doi': row['doi'], 'kind': 'official', 'reviewId': row['reviewId'],
        'sha256': digest, 'contentHash': row['contentHash'], 'byteLength': len(data),
        'assetPath': destination.as_posix(), 'contentType': 'image/svg+xml' if ext == 'svg' else 'image/png',
        'articleUrl': row['articleUrl'], 'sourceUrl': row['sourceUrl'],
        'originalR2Key': row['r2Key'], 'originalUpdatedAt': row['updatedAt'],
        'reviewBasis': 'same-doi article and source URL; exact stored bytes; Visual Abstract context; visual role review',
        'caption': 'Graphical abstract', 'approved': True
    })
manifest = {'version': 1, 'recoveryId': 'toc-batch1-20260922', 'quarantineCutoverUnchanged': 1790082000000,
 'evidenceArtifactId': ARTIFACT_ID, 'evidenceArchiveSha256': ARCHIVE_SHA256,
 'scope': 'TOC only. No automatic body-figure promotion. Build must intersect with current literature DOI membership.',
 'reviewedCount': len(items), 'deferredRoleConflicts': ['10.1021/acscatal.6c05271','10.1021/acscatal.6c05787','10.1021/acscatal.6c05029'], 'items': items}
(OUT / 'toc-batch1-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

# Preserve every existing literature release gate; add one local-only merge step.
p = ROOT / '.github/workflows/github-pages.yml'
text = p.read_text()
trigger = "      - 'cloudflare/scripts/merge-local-captures.mjs'"
if "'cloudflare/scripts/merge-reviewed-toc.mjs'" not in text:
    assert text.count(trigger) == 1
    text = text.replace(trigger, trigger + "\n      - 'cloudflare/scripts/merge-reviewed-toc.mjs'\n      - 'audit/media-recovery/toc-batch1-manifest.json'\n      - 'audit/media-recovery/assets/**'", 1)
step = '      - name: Sanitize invalid static media'
if '      - name: Restore reviewed TOC assets only' not in text:
    assert text.count(step) == 1
    text = text.replace(step, '      - name: Restore reviewed TOC assets only\n        run: node cloudflare/scripts/merge-reviewed-toc.mjs\n\n' + step, 1)
assert 'needs: literature_authorization' in text and 'node scripts/validate-pages-literature-authorization.mjs' in text
p.write_text(text)
print('REVIEWED_TOC_BUNDLE ' + json.dumps({'reviewedAssets': len(items), 'bytes': sum(r['byteLength'] for r in items), 'publisherFetches': 0, 'productionWrites': 0, 'quarantineCutoverUnchanged': True}))
