"""Feature-branch-only patch from observed 6.2.19 failures; no network or data writes."""
from pathlib import Path
p = Path('public/toc-mainline.user.js')
s = p.read_text()
assert "var VERSION = '6.2.20';" in s, 'Upgrade must follow the task/page identity patch'
start = s.index('  async function uploadArticleFigure(')
end = s.index('\n  async function uploadCapture(', start)
replacement = r'''  async function uploadArticleFigure(job, candidate, image, trace, token, order) {
    // recovery_direct_stage_v1: /import is deliberately locked during recovery.
    // Store once in R2; a positive staging receipt is not publication completion.
    var pageDoi = assertBoundCaptureJob(job, candidate.url);
    var payload = {
      doi: job.doi,
      jobId: job.jobId,
      captureVersion: VERSION,
      pageDoi: pageDoi,
      articleUrl: location.href,
      sourceUrl: candidate.url,
      id: String(candidate.label || ('figure-' + String(order + 1))).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      label: candidate.label || ('Figure ' + String(order + 1)),
      caption: candidate.text || '',
      order: Number(order || 0),
      width: Number(image.width || 0) || undefined,
      height: Number(image.height || 0) || undefined,
      imageData: image.imageData
    };
    pushTrace(trace, {
      stage: 'figure_stage', event: 'start', status: 'start',
      url: candidate.url, message: 'recovery_direct_stage:' + payload.label,
      byteLength: image.byteLength
    });
    try {
      var result = await postJson(FIGURE_STAGE_ENDPOINT, payload, token);
      if (!result || result.stored !== true || result.staged !== true ||
          normalizeDoi(result.doi) !== normalizeDoi(job.doi) ||
          String(result.id || '') !== payload.id) {
        throw new Error('figure_stage_receipt_invalid');
      }
      // A delayed response from the previous task must not complete a new job.
      assertBoundCaptureJob(job, candidate.url);
      pushTrace(trace, {
        stage: 'figure_stage', event: 'complete', status: 'ok',
        url: result.imageUrl || candidate.url,
        message: payload.label + ';stored=1;published=0',
        imageWidth: Number(result.width || image.width || 0),
        imageHeight: Number(result.height || image.height || 0),
        byteLength: image.byteLength
      });
      return Object.assign({}, result, {
        staged: true, imported: false, published: false,
        publicationState: 'pending_verified_promotion'
      });
    } catch (error) {
      pushTrace(trace, {
        stage: 'figure_stage', event: 'failed', status: 'failed',
        httpStatus: Number(error && error.httpStatus || 0),
        url: candidate.url,
        message: String(error && error.message || error)
      });
      throw error;
    }
  }
'''
s = s[:start] + replacement.rstrip() + '\n' + s[end:]
p.write_text(s)
print('APPLIED_RECOVERY_DIRECT_STAGE')
