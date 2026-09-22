"""Deterministic feature-branch patch. No network or production data operations."""
from pathlib import Path
import re

CHANGED = []
def read(path):
    return Path(path).read_text()
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Expected exactly one patch anchor: ' + old[:100])
    return text.replace(old, new, 1)
def write(path, content):
    Path(path).write_text(content)
    CHANGED.append(path)

# Recognize real URL identity, including ACS Silverchair's encoded DOI directory.
# Do not take query strings, recommendation links or a fabricated canonical URL as page proof.
HELPER = r'''function embeddedKnownDois(value) {
  let decoded = String(value || '').split(/[?#]/, 1)[0];
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  const found = new Set();
  const pattern = /10\.(1021|1002|1038|1126|1039|1016|31635)[/_]([a-z0-9._()-]+)/ig;
  for (const match of decoded.matchAll(pattern)) {
    const doi = normalizeDoi('10.' + match[1] + '/' + match[2]);
    if (doi) found.add(doi);
  }
  try {
    const url = new URL(decoded);
    if (/^(?:www\.)?nature\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/^\/articles\/(s\d+-\d+-\d+[a-z0-9-]*)/i);
      if (match) found.add(normalizeDoi('10.1038/' + match[1]));
    }
  } catch {}
  return [...found].filter(Boolean);
}
'''

for name in ['media.js', 'media-write.js', 'local-captures.js']:
    path = 'cloudflare/worker/src/' + name
    text = read(path)
    start = text.index('function embeddedKnownDois(value) {')
    end = text.index('\nfunction ', start + 1)
    text = text[:start] + HELPER.rstrip() + '\n' + text[end:]
    if name == 'local-captures.js':
        text = once(text, 'return embedded.length === 0 || embedded.includes(target);',
                    'return embedded.every(value => value === target);')
        # Old clients remain able to upload diagnostics, but not new unbound media.
        intake = r'''function captureIntakeError(payload, doi) {
  if (payload?.captureVersion !== '6.2.20') return 'capture_client_upgrade_required';
  if (!/^[a-z0-9-]{16,80}$/i.test(String(payload?.jobId || ''))) return 'capture_job_binding_missing';
  if (normalizeDoi(payload?.pageDoi || '') !== doi) return 'capture_page_doi_unverified';
  if (!safeUrl(payload?.articleUrl) || !safeUrl(payload?.sourceUrl)) return 'capture_source_evidence_missing';
  if (!captureBelongsToDoi(payload, doi)) return 'media_source_doi_mismatch';
  return '';
}

'''
        text = once(text, 'function sniffImageType(', intake + 'function sniffImageType(')
        for fn in ['importLocalCapture', 'importStagedArticleFigure']:
            pos = text.index('export async function ' + fn + '(')
            end = text.find('\nexport async function ', pos + 1)
            if end < 0: end = len(text)
            fragment = text[pos:end]
            anchor = "  if (!doi) return { status: 400, body: { error: 'A valid DOI is required.' } };"
            fragment = once(fragment, anchor, anchor + "\n  const intakeError = captureIntakeError(payload, doi);\n  if (intakeError) return { status: 409, body: { code: intakeError, error: intakeError, doi } };")
            # Persist immutable provenance with the exact object hash, not only a mutable last report.
            marker = '  index.items[identity] = {\n    doi,'
            fragment = once(fragment, marker, marker + "\n    jobId: payload.jobId,\n    captureVersion: payload.captureVersion,\n    pageDoi: payload.pageDoi,\n    mediaGeneration: MEDIA_REBUILD_EPOCH,")
            if fn == 'importStagedArticleFigure':
                fragment = once(fragment, '  if (previous && previousPixels > 0',
                                '  if (previous && Number(previous.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(previous, doi) && previousPixels > 0')
            text = text[:pos] + fragment + text[end:]
        text = once(text,
            '    .filter(([, item]) => !requestedDoi || normalizeDoi(item?.doi) === requestedDoi)',
            '    .filter(([, item]) => Number(item?.updatedAt || 0) >= MEDIA_REBUILD_EPOCH && captureBelongsToDoi(item, item?.doi))\n    .filter(([, item]) => !requestedDoi || normalizeDoi(item?.doi) === requestedDoi)')
        text = once(text, '        articleUrl: item.articleUrl,\n        id: item.id,',
                    '        articleUrl: item.articleUrl,\n        sourceUrl: item.sourceUrl,\n        id: item.id,')
    else:
        text = once(text, "return embedded.length === 0 || embedded.includes(String(doi || '').toLowerCase());",
                    "return embedded.every(value => value === String(doi || '').toLowerCase());")
    write(path, text)

path = 'public/toc-mainline.user.js'
text = read(path)
text = once(text, '// @version      6.2.19', '// @version      6.2.20')
text = once(text, "var VERSION = '6.2.19';", "var VERSION = '6.2.20';")
BROWSER_HELPER = HELPER.replace('embeddedKnownDois', 'embeddedJobDois')
BROWSER_HELPER += r'''
  function publisherPageDois() {
    var ids = embeddedJobDois(location.href);
    document.querySelectorAll('head meta[name="citation_doi"],head meta[name="dc.Identifier"],head meta[name="DC.Identifier"],head meta[property="citation_doi"],head link[rel="canonical"]').forEach(function (node) {
      ids = ids.concat(embeddedJobDois(node.getAttribute('content') || node.getAttribute('href') || ''));
    });
    return Array.from(new Set(ids));
  }

  function assertBoundCaptureJob(job, sourceUrl) {
    var live = GM_getValue(ACTIVE_JOB_KEY, null);
    if (!job || !job.jobId || !live || live.jobId !== job.jobId || live.doi !== job.doi || job.captureVersion !== VERSION) {
      throw new Error('capture_job_stale_or_unbound');
    }
    var binding = '';
    try { binding = sessionStorage.getItem(P + 'tab-job-binding') || ''; } catch (_) {}
    if (binding !== job.jobId) throw new Error('capture_tab_job_mismatch');
    var page = publisherPageDois();
    if (!page.length) throw new Error('page_doi_unverified');
    if (page.some(function (doi) { return doi !== normalizeDoi(job.doi); })) throw new Error('page_doi_mismatch');
    var source = embeddedJobDois(sourceUrl || '');
    if (source.some(function (doi) { return doi !== normalizeDoi(job.doi); })) throw new Error('media_source_doi_mismatch');
    return normalizeDoi(job.doi);
  }

  async function bindPublisherCaptureJob(job) {
    var match = String(location.hash || '').match(/(?:^#|&)osg-job=([a-z0-9-]{16,80})(?:&|$)/i);
    var binding = '';
    try {
      if (match) sessionStorage.setItem(P + 'tab-job-binding', match[1]);
      binding = sessionStorage.getItem(P + 'tab-job-binding') || '';
    } catch (_) {}
    if (!job.jobId || binding !== job.jobId) throw new Error('capture_tab_job_mismatch');
    for (var i = 0; i < 8; i += 1) {
      try { return assertBoundCaptureJob(job); }
      catch (error) {
        if (String(error.message) !== 'page_doi_unverified' || i === 7) throw error;
        await sleep(400);
      }
    }
  }
'''
text = once(text, '  function candidateBelongsToJob(url, job) {', BROWSER_HELPER + '\n  function candidateBelongsToJob(url, job) {')
start = text.index('  function candidateBelongsToJob(url, job) {')
end = text.index('\n  function publisherForDoi', start)
text = text[:start] + r'''  function candidateBelongsToJob(url, job) {
    var doi = normalizeDoi(job && job.doi);
    return Boolean(doi && embeddedJobDois(url).every(function (value) { return value === doi; }));
  }
''' + text[end:]
text = once(text, "      job.startedAt = nowIso();\n\n      var taskKind", "      job.startedAt = nowIso();\n      job.jobId = crypto.randomUUID();\n      job.captureVersion = VERSION;\n\n      var taskKind")
text = once(text, 'tab = GM_openInTab(articleUrl(job), {', "tab = GM_openInTab(articleUrl(job) + '#osg-job=' + encodeURIComponent(job.jobId), {")
text = once(text, "    writePublisherHeartbeat(job, 'active_job_seen');", r'''    try {
      await bindPublisherCaptureJob(job);
    } catch (error) {
      // Do not complete or overwrite the active job from an unrelated tab.
      await uploadReport(job, [{ stage: 'page_doi_guard', event: 'rejected', status: 'failed', url: location.href, message: String(error.message) }], 'failed', String(error.message), null, writeToken());
      return;
    }
    writePublisherHeartbeat(job, 'active_job_seen');''')
text = once(text, '  async function runPublisherJob(job) {\n', '  async function runPublisherJob(job) {\n    assertBoundCaptureJob(job);\n')
for fn in ['uploadArticleFigure', 'uploadCapture']:
    pos = text.index('  async function ' + fn + '(')
    end = text.index('\n  async function ', pos + 1)
    fragment = text[pos:end]
    brace = fragment.index(' {\n') + len(' {\n')
    fragment = fragment[:brace] + '    assertBoundCaptureJob(job, candidate.url);\n' + fragment[brace:]
    fragment = once(fragment, 'doi: job.doi,', "doi: job.doi,\n      jobId: job.jobId,\n      captureVersion: VERSION,\n      pageDoi: normalizeDoi(job.doi),")
    text = text[:pos] + fragment + text[end:]
text = once(text, '    for (var i = 0; i < jobs.length; i += 1) {', '    GM_setValue(SUMMARY_KEY, summary);\n\n    for (var i = 0; i < jobs.length; i += 1) {')
text = once(text, "      window.alert(JSON.stringify(GM_getValue(SUMMARY_KEY, {}), null, 2));", "      var summary = GM_getValue(SUMMARY_KEY, {});\n      window.alert(JSON.stringify({ runtimeVersion: VERSION, summaryIsCurrentVersion: summary.version === VERSION, activeJob: GM_getValue(ACTIVE_JOB_KEY, null), summary: summary }, null, 2));")
write(path, text)

path = 'cloudflare/scripts/build-bridge-loader.mjs'
text = read(path)
text = text.replace("var VERSION = '6.2.19';", "var VERSION = '6.2.20';")
text = once(text, "const loaderVersion = '2.2.19';", "const loaderVersion = '2.2.20';")
text = once(text, '// @grant        GM_deleteValue\n', '// @grant        GM_deleteValue\n// @grant        GM_listValues\n')
write(path, text)
print('PATCHED_MEDIA_FILES ' + ','.join(CHANGED))
