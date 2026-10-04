"""Scoped candidate selection only; preserves queue, authorization and quality gates."""
from pathlib import Path
r=Path(__file__).resolve().parents[1];p=r/'public/toc-mainline.user.js';s=p.read_text()
if "var PUBLISHER_MEDIA_REVISION = '20261004-publisher-sources-v7';" in s:
 print('Publisher sources already patched');raise SystemExit(0)
def rep(a,b):
 global s
 if s.count(a)!=1:raise RuntimeError(f'Expected one anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)
rep("  var QUEUE_COVERAGE_REVISION = '20261003-queue-coverage-v6';", "  var QUEUE_COVERAGE_REVISION = '20261003-queue-coverage-v6';\n  var PUBLISHER_MEDIA_REVISION = '20261004-publisher-sources-v7';")
rep(" + ' · 全队列补缺6';", " + ' · 全队列补缺6 · 图源适配7';")
rep("      var context = visualScope(node);\n      if (!context || !context.label || context.official) return;", "      var context = visualScope(node);\n      if(job.publisher==='wiley')context=wileyBodyFigureContext(node,context);\n      if (!context || !context.label || context.official) return;")
rep("    pushTrace(trace,{stage:'figure_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'isolated_labels='+new Set(rows.map(function(r){return r.label;})).size+';variants='+rows.length});", "    pushTrace(trace,{stage:'figure_discovery',event:'scan_complete',status:rows.length?'found':'none',message:'isolated_labels='+new Set(rows.map(function(r){return r.label;})).size+';variants='+rows.length});\n    if(job.publisher==='wiley'&&!rows.length)pushTrace(trace,{stage:'figure_discovery',event:'wiley_dom_shape',status:'none',message:'images='+scope.querySelectorAll('img,object[type^=\"image\"]').length+';figureBlocks='+scope.querySelectorAll('figure,[role=\"figure\"],.article-section__figure').length+';numberedHeadings='+Array.from(scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=\"heading\"]')).filter(function(n){return /^(?:Fig(?:ure)?\\.?|Scheme|Chart)\\s*\\d+[a-z]?\\b/i.test(String(n.textContent||'').trim());}).length});")
rep("  function visualScope(node) {",(r/'scripts/publisher-body-context.inc.js').read_text()+"\n  function visualScope(node) {")
rep("    for (var i=0;i<Math.min(candidates.length,4);i+=1) {", "    candidates=orderedFigureCandidates(job,candidates,role);\n    for (var i=0;i<candidates.length;i+=1) {")
rep("    if (role !== 'figure' || job.publisher !== 'acs') return null;\n    for (var i", "    if (role !== 'figure' || job.publisher !== 'acs') return null;\n    var seenFallback=new Set();\n    for (var i")
rep("      if (!current) continue;\n      var ids = embeddedJobDois(current);", "      if (!current || seenFallback.has(candidate.label+'|'+current)) continue;\n      seenFallback.add(candidate.label+'|'+current);\n      var ids = embeddedJobDois(current);")
rep("queueCoverageRevision:typeof QUEUE_COVERAGE_REVISION", "publisherMediaRevision:typeof PUBLISHER_MEDIA_REVISION==='string'?PUBLISHER_MEDIA_REVISION:'',queueCoverageRevision:typeof QUEUE_COVERAGE_REVISION")
p.write_text(s);print('Patched ACS candidate order and scoped Wiley headings only')
