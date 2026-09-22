"""Read existing literature media only; never restore, promote, delete or fetch publishers."""
import collections
import datetime
import hashlib
import json
import os
import pathlib
import re
import urllib.parse
import urllib.request

CUTOVER = 1790082000000
TABLES = ('toc_assets', 'figure_assets', 'primary_visual_assets', 'primary_visual_variants')
FIELDS = {'doi', 'semantic_key', 'source_id', 'label', 'article_url', 'source_url', 'r2_key', 'content_hash', 'width', 'height', 'updated_at', 'available', 'kind', 'role', 'reason'}
INDEXES = {'local': 'local-captures/index.json', 'staged': 'local-captures/article-figures/stage-index.json', 'reports': 'local-captures/tampermonkey/report-index.json'}
ACCOUNT = os.environ['CLOUDFLARE_ACCOUNT_ID']
TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
BASE = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT
BUCKET = 'organic-synthesis-gallery-media'
OUT = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'media-salvage'
OUT.mkdir(parents=True, exist_ok=True)


def api(path, payload=None, raw=False):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as res:
        body = res.read(12000001)
    if len(body) > 12000000:
        raise ValueError('response_size_limit')
    if raw:
        return body
    obj = json.loads(body)
    if obj.get('success') is not True:
        raise ValueError('Cloudflare API success=false')
    return obj['result']


def safe_url(value):
    try:
        u = urllib.parse.urlsplit(str(value or ''))
        if u.scheme not in ('https', 'http') or not u.hostname:
            return ''
        return urllib.parse.urlunsplit((u.scheme, u.hostname, u.path, '', ''))
    except ValueError:
        return ''


def norm(value):
    s = urllib.parse.unquote(str(value or '')).lower().strip()
    s = re.sub(r'^https?://(?:dx\.)?doi\.org/|^doi:\s*', '', s)
    return s if re.fullmatch(r'10\.\d{4,9}/[^\s?#]+', s) else ''


def embedded(value):
    s = safe_url(value)
    for _ in range(3):
        new = urllib.parse.unquote(s)
        if new == s:
            break
        s = new
    found = set()
    # ACS Silverchair encodes the DOI slash as underscore in its article directory.
    for m in re.finditer(r'10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()\-]+)', s.lower()):
        found.add('10.' + m[1] + '/' + m[2])
    m = re.search(r'https?://(?:www\.)?nature\.com/articles/(s\d+-\d+-\d+[a-z0-9-]*)', s.lower())
    if m:
        found.add('10.1038/' + m[1])
    return found


def list_rows(obj):
    rows = obj.get('items', {})
    if isinstance(rows, dict):
        return list(rows.values())
    if isinstance(rows, list):
        return rows
    raise ValueError('invalid_index_items')


def emit(kind, obj):
    print('MEDIA_SALVAGE_' + kind + ' ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')), flush=True)


errors = []
assets = []
index_evidence = {}
reports = []
for name, key in INDEXES.items():
    try:
        body = api('/r2/buckets/' + BUCKET + '/objects/' + urllib.parse.quote(key, safe='/'), raw=True)
        obj = json.loads(body)
        rows = list_rows(obj)
        index_evidence[name] = {'rows': len(rows), 'updatedAt': obj.get('updatedAt'), 'sha256': hashlib.sha256(body).hexdigest()}
        if name == 'reports':
            reports = rows
            continue
        for r in rows:
            assets.append({'store': name, 'doi': norm(r.get('doi')), 'id': r.get('id') or r.get('kind'), 'label': r.get('label'), 'kind': r.get('kind'), 'articleUrl': safe_url(r.get('articleUrl')), 'sourceUrl': safe_url(r.get('sourceUrl')), 'r2Key': r.get('r2Key'), 'contentHash': r.get('contentHash'), 'width': r.get('width'), 'height': r.get('height'), 'updatedAt': r.get('updatedAt'), 'source': r.get('source')})
    except Exception as e:
        errors.append({'source': name, 'errorType': type(e).__name__, 'httpStatus': getattr(e, 'code', None)})


d1_stats = {}
try:
    dbs = api('/d1/database?per_page=100')
    matches = [r for r in dbs if r.get('name') == 'organic-synthesis-gallery']
    if len(matches) != 1:
        raise ValueError('database_not_unique')
    db = matches[0]['uuid']

    def query(sql):
        if not sql.startswith(('SELECT ', 'PRAGMA table_info(')):
            raise ValueError('read_only_sql_required')
        result = api('/d1/database/' + db + '/query', {'sql': sql})
        if len(result) != 1 or result[0].get('success') is not True:
            raise ValueError('query_failed')
        return result[0].get('results', [])

    for table in TABLES:
        try:
            schema = query('PRAGMA table_info(' + table + ')')
            columns = sorted({r['name'] for r in schema} & FIELDS)
            if not columns or 'doi' not in columns:
                raise ValueError('media_table_schema_missing')
            count = query('SELECT COUNT(*) AS n FROM ' + table)[0]['n']
            rows = query('SELECT ' + ','.join(columns) + ' FROM ' + table + ' LIMIT 5001')
            if len(rows) != count or count > 5000:
                raise ValueError('incomplete_table_snapshot')
            d1_stats[table] = {'rows': count, 'columns': columns}
            for r in rows:
                if table == 'toc_assets' and (not r.get('r2_key') or not r.get('available')):
                    continue
                assets.append({'store': table, 'doi': norm(r.get('doi')), 'id': r.get('semantic_key') or r.get('role') or r.get('kind') or 'toc', 'label': r.get('label'), 'kind': r.get('kind'), 'articleUrl': safe_url(r.get('article_url')), 'sourceUrl': safe_url(r.get('source_url')), 'r2Key': r.get('r2_key'), 'contentHash': r.get('content_hash'), 'width': r.get('width'), 'height': r.get('height'), 'updatedAt': r.get('updated_at')})
        except Exception as e:
            errors.append({'source': table, 'errorType': type(e).__name__, 'httpStatus': getattr(e, 'code', None)})
except Exception as e:
    errors.append({'source': 'd1', 'errorType': type(e).__name__, 'httpStatus': getattr(e, 'code', None)})

hash_owners = collections.defaultdict(set)
for r in assets:
    h = str(r.get('contentHash') or '')
    if h and r['doi']:
        hash_owners[h].add(r['doi'])

for r in assets:
    target = r['doi']
    page = embedded(r['articleUrl'])
    source = embedded(r['sourceUrl'])
    foreign = (page | source) - {target}
    r['foreignDois'] = sorted(foreign)
    r['beforeCutover'] = float(r.get('updatedAt') or 0) < CUTOVER
    r['restoreApproved'] = False
    if not target or not r.get('r2Key') or not r.get('contentHash'):
        r['classification'] = 'incomplete_record'
    elif foreign:
        r['classification'] = 'cross_doi_conflict'
    elif len(hash_owners[str(r['contentHash'])]) > 1:
        r['classification'] = 'cross_doi_duplicate_hash'
    elif page == {target} and source == {target}:
        r['classification'] = 'dual_url_match_candidate'
    elif page == {target}:
        r['classification'] = 'page_only_needs_image_evidence'
    else:
        r['classification'] = 'identity_unverified'

# Same DOI + exact stored hash can connect a D1 asset to independently saved source evidence.
proven = {(r['doi'], r['contentHash']) for r in assets if r['classification'] == 'dual_url_match_candidate'}
for r in assets:
    if r['classification'] in ('page_only_needs_image_evidence', 'identity_unverified') and (r['doi'], r.get('contentHash')) in proven:
        r['classification'] = 'same_doi_hash_linked_candidate'

mismatches = []
for r in reports:
    target = norm(r.get('doi'))
    foreign = (embedded(r.get('articleUrl')) | embedded(r.get('sourceUrl'))) - {target}
    if target and foreign:
        mismatches.append({'doi': target, 'foreignDois': sorted(foreign), 'status': r.get('status'), 'updatedAt': r.get('updatedAt'), 'articleUrl': safe_url(r.get('articleUrl')), 'sourceUrl': safe_url(r.get('sourceUrl'))})

summary = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'baseSha': os.environ.get('GITHUB_SHA'), 'readOnly': True, 'atomicSnapshot': False, 'cutoverMs': CUTOVER, 'indexEvidence': index_evidence, 'd1Tables': d1_stats, 'assets': len(assets), 'uniqueDois': len({r['doi'] for r in assets}), 'beforeCutoverAssets': sum(r['beforeCutover'] for r in assets), 'classification': dict(collections.Counter(r['classification'] for r in assets)), 'byStore': {store: dict(collections.Counter(r['classification'] for r in assets if r['store'] == store)) for store in sorted({r['store'] for r in assets})}, 'latestReportMismatchCount': len(mismatches), 'errors': errors, 'restoredAssets': 0, 'byteLevelVerified': False, 'coverageNote': 'Existing index and D1 rows only. R2 orphan objects, prior deployment mirrors, report histories and deleted assets are not covered. Candidate does not mean approved.'}
(OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
(OUT / 'candidates.json').write_text(json.dumps({'summary': summary, 'assets': assets, 'latestReportMismatches': mismatches}, ensure_ascii=False, indent=2))
emit('SUMMARY', summary)
for r in assets:
    if r['classification'] in ('cross_doi_conflict', 'cross_doi_duplicate_hash'):
        emit('CONFLICT', r)
emit('LATEST_REPORT_MISMATCHES', mismatches)
if errors:
    raise SystemExit('Inventory incomplete; no automatic restoration permitted.')
