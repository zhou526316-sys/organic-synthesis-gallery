"""Bounded, read-only recovery verification. Writes runner artifacts, never live media."""
import concurrent.futures as cf
import datetime as dt
import hashlib
import io
import json
import os
import pathlib
import re
import urllib.error
import urllib.parse as up
import urllib.request as ur
import zipfile

CUT = 1790082000000
SITE = 'https://zhou526316-sys.github.io/organic-synthesis-gallery'
BUCKET = 'organic-synthesis-gallery-media'
ROOT = pathlib.Path(os.environ['RUNNER_TEMP']) / 'recovery-evidence'
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / 'images').mkdir(exist_ok=True)
ACCOUNT = os.environ['CLOUDFLARE_ACCOUNT_ID']
TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
API = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT
ERRORS = []


def read_url(url, headers=None, payload=None, limit=12000000):
    data = None if payload is None else json.dumps(payload).encode()
    h = {'Accept': '*/*', 'Cache-Control': 'no-cache', **(headers or {})}
    if payload is not None:
        h['Content-Type'] = 'application/json'
    with ur.urlopen(ur.Request(url, headers=h, data=data), timeout=25) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError('response_size_limit')
        return body


def api(path, payload=None):
    obj = json.loads(read_url(API + path, {'Authorization': 'Bearer ' + TOKEN}, payload))
    if obj.get('success') is not True:
        raise ValueError('cloudflare_api_not_successful')
    return obj['result']


def r2(key, limit=4000000):
    if not isinstance(key, str) or '..' in key or key.startswith('/'):
        raise ValueError('invalid_object_key')
    return read_url(API + '/r2/buckets/' + BUCKET + '/objects/' + up.quote(key, safe='/'), {'Authorization': 'Bearer ' + TOKEN}, limit=limit)


def safe_url(value):
    try:
        u = up.urlsplit(str(value or ''))
        if u.scheme not in ('http', 'https') or not u.hostname:
            return ''
        return up.urlunsplit((u.scheme, u.hostname, u.path, '', ''))[:2000]
    except ValueError:
        return ''


def safe(value, key=''):
    if isinstance(value, dict):
        return {k: safe(v, k) for k, v in value.items() if not re.search(r'(?i)token|secret|password|cookie|authorization|credential', k)}
    if isinstance(value, list):
        return [safe(v, key) for v in value]
    if isinstance(value, str):
        if key.lower().endswith('url') or key == 'href':
            return safe_url(value)
        s = re.sub(r'https?://[^\s<>"\']+', lambda m: safe_url(m.group()), value)
        return re.sub(r'(?i)Bearer\s+\S+|(?:token|secret|password|cookie|authorization)\s*[:=]\s*\S+', '[redacted]', s)[:1800]
    return value


def rows(obj):
    items = obj.get('items', {})
    if isinstance(items, dict):
        return list(items.values())
    if isinstance(items, list):
        return items
    raise ValueError('invalid_items_shape')


def stamp(value):
    try:
        return float(value or 0)
    except (ValueError, TypeError):
        return 0


def emit(kind, value):
    print('RECOVERY_EVIDENCE_' + kind + ' ' + json.dumps(value, ensure_ascii=False, separators=(',', ':')), flush=True)


def record_error(scope, e):
    ERRORS.append({'scope': scope, 'errorType': type(e).__name__, 'httpStatus': getattr(e, 'code', None)})


# Frozen prior inventory: retrieve an already-created artifact, never alter it.
gh = 'https://api.github.com/repos/zhou526316-sys/organic-synthesis-gallery/actions/artifacts/10698004964/zip'
frozen = read_url(gh, {'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'X-GitHub-Api-Version': '2022-11-28'})
if hashlib.sha256(frozen).hexdigest() != 'f6b7cbcbe6ec770c52d988af1bdae5b30727417e802a7a41e223a19d3b28cf93':
    raise ValueError('frozen_inventory_artifact_hash_mismatch')
with zipfile.ZipFile(io.BytesIO(frozen)) as archive:
    inventory = json.loads(archive.read('candidates.json'))
old = [x for x in inventory['assets'] if x.get('beforeCutover') and x['classification'] == 'dual_url_match_candidate']
if len(old) != 93:
    raise ValueError('frozen_candidate_count_changed')

keys = {'local': 'local-captures/index.json', 'staged': 'local-captures/article-figures/stage-index.json', 'reports': 'local-captures/tampermonkey/report-index.json', 'diagnostics': 'local-captures/diagnostics/latest.json'}
indexes = {}
for name, key in keys.items():
    try:
        indexes[name] = json.loads(r2(key, 5000000))
    except Exception as e:
        record_error(name, e)

# The raw indexes are not returned. Only fields needed for acceptance are kept.
asset_fields = ['doi', 'id', 'kind', 'label', 'caption', 'articleUrl', 'sourceUrl', 'r2Key', 'contentHash', 'contentType', 'width', 'height', 'byteLength', 'capturedAt', 'updatedAt', 'source']
current = []
for store in ['local', 'staged']:
    for row in rows(indexes.get(store, {})):
        if stamp(row.get('updatedAt')) >= CUT:
            current.append({'store': store, **{k: row[k] for k in asset_fields if k in row}})

report_index = rows(indexes.get('reports', {}))
attempts = {}
for row in report_index:
    for attempt in [row] + (row.get('attempts') or []):
        if stamp(attempt.get('updatedAt')) >= CUT and attempt.get('reportKey'):
            attempts[attempt['reportKey']] = attempt
ordered = sorted(attempts.values(), key=lambda a: stamp(a.get('updatedAt')), reverse=True)
# At most 40 actual immutable reports, preserving job/version/dimension/upload traces.
def report_read(a):
    try:
        obj = json.loads(r2(a['reportKey'], 1500000))
        return safe(obj)
    except Exception as e:
        return {'doi': a.get('doi'), 'reportReadError': type(e).__name__, 'httpStatus': getattr(e, 'code', None)}
with cf.ThreadPoolExecutor(max_workers=3) as pool:
    reports = list(pool.map(report_read, ordered[:40]))

# New D1 rows are queried separately from R2 staging; no import/promotion is called.
d1 = {}
try:
    dbs = api('/d1/database?per_page=100')
    matches = [x for x in dbs if x.get('name') == 'organic-synthesis-gallery']
    if len(matches) != 1:
        raise ValueError('database_not_unique')
    db = matches[0]['uuid']
    for table, fields in [('toc_assets', 'doi,article_url,r2_key,content_hash,available,reason,updated_at'), ('figure_assets', 'doi,source_id,semantic_key,label,article_url,r2_key,content_hash,width,height,updated_at')]:
        result = api('/d1/database/' + db + '/query', {'sql': 'SELECT ' + fields + ' FROM ' + table + ' WHERE updated_at >= ? LIMIT 1001', 'params': [CUT]})
        if len(result) != 1 or result[0].get('success') is not True:
            raise ValueError('query_failed')
        result_rows = result[0].get('results', [])
        if len(result_rows) > 1000:
            raise ValueError('d1_sample_incomplete')
        d1[table] = result_rows
except Exception as e:
    record_error('d1', e)

public = {}
for name in ['media-index.json', 'toc-demand-live.json']:
    try:
        obj = json.loads(read_url(SITE + '/' + name + '?acceptance=' + os.environ['GITHUB_RUN_ID']))
        public[name] = obj
    except Exception as e:
        record_error(name, e)

# Read real image bytes for all 93 retained candidates and the new trial assets.
selected = [{'sample': 'old93', **x} for x in old]
selected += [{'sample': 'new_trial', **x} for x in current]
if len(selected) > 160:
    raise ValueError('image_sample_budget_exceeded')

def file_type(data):
    text = data[:2000].lstrip(b'\xef\xbb\xbf \r\n\t').lower()
    if b'<svg' in text:
        return 'svg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return 'gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    if data[:4] in (b'II*\x00', b'MM\x00*'):
        return 'tif'
    return 'unknown'

def verify_image(pair):
    num, asset = pair
    result = safe(asset)
    result['reviewId'] = 'image-%03d' % num
    result['restoreApproved'] = False
    try:
        data = r2(asset['r2Key'])
        digest = hashlib.sha256(data).hexdigest()
        expected = str(asset.get('contentHash') or '').lower()
        valid = len(expected) in (16, 32, 64) and bool(re.fullmatch('[0-9a-f]+', expected)) and digest.startswith(expected)
        kind = file_type(data)
        result.update({'computedSha256': digest, 'storedHashMatchesBytes': valid, 'actualBytes': len(data), 'actualType': kind})
        if not valid or kind == 'unknown' or len(data) < 100:
            result['byteStatus'] = 'rejected'
        else:
            path = 'images/' + result['reviewId'] + '.' + kind
            (ROOT / path).write_bytes(data)
            result['file'] = path
            result['byteStatus'] = 'verified'
    except Exception as e:
        result.update({'byteStatus': 'unavailable', 'errorType': type(e).__name__, 'httpStatus': getattr(e, 'code', None)})
    return result

with cf.ThreadPoolExecutor(max_workers=3) as pool:
    verified = list(pool.map(verify_image, enumerate(selected, 1)))

# Add readable captions from retained current index entries where exact DOI/hash agree.
by_hash = {}
for store in ['local', 'staged']:
    for asset in rows(indexes.get(store, {})):
        by_hash[(asset.get('doi'), asset.get('contentHash'))] = asset
for asset in verified:
    current_entry = by_hash.get((asset.get('doi'), asset.get('contentHash')))
    if current_entry:
        asset['storedCaption'] = safe(current_entry.get('caption', ''))

compact_reports = []
for report in reports:
    trace = report.get('trace') or []
    versions = sorted(set(m.group(1) for t in trace for m in [re.search(r'\bv(6\.2\.\d+)', str(t.get('message', '')))] if m))
    compact_reports.append({k: report[k] for k in ['doi','status','reason','articleUrl','sourceUrl','startedAt','finishedAt','updatedAt','queueGeneratedAt'] if k in report} | {'runtimeVersionsInTrace': versions, 'reportReadError': report.get('reportReadError')})

from collections import Counter
summary = {'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'readOnly': True, 'atomicSnapshot': False, 'cutoverMs': CUT, 'frozenOldCandidates': len(old), 'oldByteStatus': dict(Counter(x['byteStatus'] for x in verified if x['sample'] == 'old93')), 'currentAssetCounts': dict(Counter(x['store'] for x in current)), 'postCutoverReportAttempts': len(ordered), 'fullReportsRead': len(reports), 'reportsComplete': len(ordered) <= 40 and all('reportReadError' not in r for r in reports), 'newD1Counts': {k: len(v) for k,v in d1.items()}, 'errors': ERRORS, 'restoredAssets': 0, 'pixelReviewDone': False}
manifest = public.get('media-index.json')
if manifest:
    items = rows(manifest)
    summary['publishedMedia'] = {'generatedAt': manifest.get('generatedAt'), 'records': len(items), 'figures': sum(len((x.get('figures') or {}).get('figures') or []) for x in items)}
queue = public.get('toc-demand-live.json')
if queue:
    summary['queue'] = {k: queue.get(k) for k in ['generatedAt','webpageDoiCount','visibleGapTotal','missingOfficialTotal','figureGapTotal']}
(ROOT / 'verification.json').write_text(json.dumps({'summary': summary, 'images': verified, 'reports': reports, 'compactReports': compact_reports, 'newD1': safe(d1), 'uploadedDiagnostics': safe(indexes.get('diagnostics', {})), 'publishedMedia': safe(manifest)}, ensure_ascii=False, indent=2))
(ROOT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
emit('SUMMARY', summary)
for report in compact_reports:
    emit('ATTEMPT', report)
for table, items in d1.items():
    emit('D1_' + table, safe(items))
if ERRORS:
    raise SystemExit('Evidence incomplete; no restoration authorized.')
