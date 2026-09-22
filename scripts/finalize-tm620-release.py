from pathlib import Path

def once(s,a,b):
 assert s.count(a)==1,'Unexpected source anchor: '+a[:100]
 return s.replace(a,b,1)

p=Path('public/toc-mainline.user.js');s=p.read_text()
if 'toc_capture_receipt_invalid' not in s:
 a=s.index('  async function uploadCapture(');b=s.index('  async function uploadReport(',a);part=s[a:b]
 part=once(part,"      }, token);\n      pushTrace(trace, {", "      }, token);\n      assertBoundCaptureJob(job, image.sourceUrl || candidate.url);\n      if (!result || result.stored !== true || normalizeDoi(result.doi) !== normalizeDoi(job.doi) || result.kind !== candidate.kind) throw new Error('toc_capture_receipt_invalid');\n      pushTrace(trace, {")
 s=s[:a]+part+s[b:]
 # Independently report current engine, nonce and progress for every upload.
 a=s.index('  async function uploadReport(');b=s.index('  function failureReason',a);part=s[a:b]
 part=part.replace('        publisher: job.publisher,','        publisher: job.publisher,\n        captureVersion: VERSION,\n        jobId: job.jobId,')
 part=part.replace('      status: status,\n      reason: reason,','      status: status,\n      version: VERSION,\n      jobId: job.jobId,\n      reason: reason,')
 s=s[:a]+part+s[b:];p.write_text(s)

p=Path('src/platform-api.ts');s=p.read_text()
if '// tm620-live-figure-union' not in s:
 s=once(s,'  order: number;\n}', '  order: number;\n  width?: number;\n  height?: number;\n}')
 a=s.index('function mergeMediaItem(');b=s.index('\nfunction loadMediaManifest()',a)
 s=s[:a]+'''// tm620-live-figure-union: a static Figure 1 must not hide later verified body figures.
function mergeMediaItem(local: StaticMediaItem | undefined, dynamic: StaticMediaItem | undefined): StaticMediaItem | undefined {
  if (!local) return dynamic;
  if (!dynamic) return local;
  const official = (t: StaticToc) => Boolean(t?.available && t.imageUrl && !/fallback/i.test(t.reason || ''));
  const toc = official(local.toc) ? local.toc : official(dynamic.toc) ? dynamic.toc : mediaItemHasToc(local) ? local.toc : dynamic.toc;
  const figuresByLabel = new Map<string, StaticFigure>();
  for (const figure of [...(local.figures?.figures || []), ...(dynamic.figures?.figures || [])]) {
    const key = String(figure.label || figure.id).toLowerCase().replace(/^fig(?:\\.\\s*|\\s+)/, 'figure ').replace(/[^a-z0-9]+/g, '-');
    const old = figuresByLabel.get(key);
    const pixels = (f: StaticFigure) => Number(f.width || 0) * Number(f.height || 0);
    if (!old || (pixels(old) > 0 && pixels(figure) > pixels(old))) figuresByLabel.set(key, figure);
  }
  const collection = [...figuresByLabel.values()].sort((a,b) => Number(a.order || 0)-Number(b.order || 0) || a.label.localeCompare(b.label,undefined,{numeric:true}));
  return {
    ...dynamic, ...local, toc,
    figures: { ...local.figures, available: collection.length > 0, doi: local.doi, figures: collection },
    inventory: {
      ...(dynamic.inventory || {}), ...(local.inventory || {}),
      status: toc?.available && collection.length ? 'complete' : toc?.available ? 'large_only' : collection.length ? 'figures_only' : 'missing',
      largeSource: official(toc) ? 'toc' : collection.length ? 'figure' : 'none',
      figureCount: collection.length,
    },
  };
}
''' + s[b:]
 old='''    const incomplete = requested.filter(doi => {
      const item = localByDoi.get(doi);
      return !mediaItemHasToc(item) || !mediaItemHasFigures(item);
    });'''
 s=once(s,old,'''    // Individual static images do not prove a complete collection; query the current batch once.
    const incomplete = requested;''')
 s=s.replace("{ dois: incomplete });", "{ dois: incomplete, readOnly: true });")
 p.write_text(s)

p=Path('cloudflare/worker/src/index.js');s=p.read_text()
if "url.pathname === '/api/media/capture-capabilities'" not in s:
 anchor="  if (request.method === 'GET' && url.pathname === '/api/user-ui/article-summary') {"
 route="""  if (request.method === 'GET' && url.pathname === '/api/media/capture-capabilities') {
    return json({ captureVersion: '6.2.20', bridgeVersion: '2.2.20', mediaGeneration: 1790082000000,
      staging: true, boundCaptureIndexing: true, safeSvg: true, directServerRepair: false,
      bodyCollection: 'bounded-single-visit', maxNewFiguresPerVisit: 20 }, { headers: { ...cors, 'cache-control': 'no-store' } });
  }

"""
 s=once(s,anchor,route+anchor);p.write_text(s)

# Promotion counts must mean a matching actual D1 row, not just an HTTP-success upsert attempt.
p=Path('cloudflare/worker/src/local-captures.js');s=p.read_text()
if 'staged_index_receipt_mismatch' not in s:
 anchor='      promoted.push({ doi: item.doi, id: item.id, r2Key: item.r2Key });'
 s=once(s,anchor,"      const stored = await env.DB.prepare('SELECT content_hash FROM figure_assets WHERE doi = ? AND source_id = ?').bind(item.doi, item.id).first();\n      if (stored?.content_hash !== item.contentHash) throw new Error('staged_index_receipt_mismatch');\n"+anchor)
 p.write_text(s)
print('TM620_FINALIZED_RECEIPTS_AND_LIVE_BODY_UNION')
