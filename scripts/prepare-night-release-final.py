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
a=s.find("  if (false && previous && previous.captureVersion==='6.2.20'")
if a>=0:
 b=s.index('  const key = ARTICLE_FIGURE_STAGE_PREFIX',a)
 s=s[:a]+s[b:]
p.write_text(s)
p=Path('scripts/test-tm-night-release.mjs');s=p.read_text()
assert 'nowIso:()=>new Date().toISOString()' in s
# The old integrated runtime still had a viewport-triggered parallel collector.
# Keep its token settings UI, but disable every path into that legacy media queue.
p=Path('cloudflare/scripts/build-bridge-loader.mjs');s=p.read_text()
anchor="await writeFile(RUNTIME_OUTPUT, runtime, 'utf8');"
patch=r'''// legacy_runtime_media_disabled: all media acquisition belongs to the bound mainline.
for (const signature of ['  function queueDoi(doi, priority = false) {','  function pump() {','  function scan() {']) {
  replaceRequired(signature, signature + '\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) return;', 'disable legacy '+signature);
}
replaceRequired('  function updateStatus() {',
  "  function updateStatus() {\n    if (globalThis.__OSG_TOC_BROWSER_MAINLINE__) { const node=statusNode(); node.textContent='VPN Bridge 2.2.20 · 抓取由主线控制'; node.title='从 Tampermonkey 菜单启动夜间连续抓取；本按钮保留密钥设置。'; return; }",
  'do not display obsolete legacy acquisition counts');

'''
if 'legacy_runtime_media_disabled' not in s:
 assert s.count(anchor)==1
 s=s.replace(anchor,patch+anchor,1)
p.write_text(s)
print('NIGHT_FINAL_PREPARED: one media engine; media-read merging only; no literature/auth/release-policy edits')
