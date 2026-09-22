from pathlib import Path
p=Path('src/platform-api.ts');s=p.read_text()
old='  const figures = mediaItemHasFigures(local) ? local.figures : dynamic.figures;'
new='''  // Keep reviewed local image bytes, but do not let one cached Figure 1 hide a new body collection.
  const byFigure = new Map<string, StaticFigure>();
  for (const figure of dynamic.figures?.figures || []) byFigure.set(String(figure.id || figure.label).toLowerCase(), figure);
  for (const figure of local.figures?.figures || []) byFigure.set(String(figure.id || figure.label).toLowerCase(), figure);
  const mergedFigures = [...byFigure.values()].sort((a,b) => a.order-b.order);
  const figures = {...(dynamic.figures || local.figures), doi: local.doi, available: mergedFigures.length > 0, figures: mergedFigures};'''
if old in s:s=s.replace(old,new,1)
else:assert 'const byFigure = new Map<string, StaticFigure>();' in s
old='return !mediaItemHasToc(item) || !mediaItemHasFigures(item);'
assert old in s or "item?.toc?.reason === 'figure1_fallback'" in s
s=s.replace(old,"return !mediaItemHasToc(item) || !mediaItemHasFigures(item) || item?.toc?.reason === 'figure1_fallback';")
p.write_text(s)
p=Path('cloudflare/worker/src/local-captures.js');s=p.read_text()
# The verified publication SQL now independently compares quality. Remove the obsolete early-return block.
a=s.find("  if (false && previous && previous.captureVersion==='6.2.20'")
if a>=0:
 b=s.index('  const key = ARTICLE_FIGURE_STAGE_PREFIX',a)
 s=s[:a]+s[b:]
p.write_text(s)
# Existing test contexts receive the same nowIso helper present in production.
p=Path('scripts/test-tm-night-release.mjs');s=p.read_text()
assert 'nowIso:()=>new Date().toISOString()' in s
print('NIGHT_FINAL_PREPARED: media-read merging only; no literature/auth/release-policy edits')
