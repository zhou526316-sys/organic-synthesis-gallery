#!/usr/bin/env python3
"""Idempotent, anchor-checked code maintenance; never edits production datasets."""
from pathlib import Path

changed = []
def patch(file, old, new):
    p = Path(file)
    text = p.read_text(encoding='utf-8')
    if new in text:
        return
    if text.count(old) != 1:
        raise RuntimeError(f'Concurrent/source change: expected one exact anchor in {file}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    if file not in changed:
        changed.append(file)

patch('src/main.ts', "import { api } from './platform-api';", "import { api } from './platform-api';\nimport { chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';")
patch('src/main.ts', '  title: string | null;\n  doi: string | null;', '  title: string | null;\n  titleZh?: string;\n  doi: string | null;')
patch('src/main.ts', '      if (!existing.title && paper.title) existing.title = paper.title;', '      if (!existing.title && paper.title) existing.title = paper.title;\n      if (validChineseTitle(paper.titleZh)) existing.titleZh = paper.titleZh;')
patch('src/main.ts', "  if (language === 'zh') return zhTitleCache.get(paper.title) || paper.title;", "  if (language === 'zh') return chineseTitle(paper, zhTitleCache) || paper.title;")
patch('src/main.ts', "        paper.title ? zhTitleCache.get(paper.title) || '' : '',", "        chineseTitle(paper, zhTitleCache),")
patch('src/main.ts', "const missing = [...new Set(papers.map(paper => paper.title).filter((title): title is string => Boolean(title)))].filter(title => !zhTitleCache.has(title));", "const missing = [...new Set(papers.filter(paper => !chineseTitle(paper, zhTitleCache)).map(paper => paper.title).filter((title): title is string => Boolean(title)))];")
patch('src/main.ts', "if (typeof item.title === 'string' && typeof item.zh === 'string' && item.zh.trim()) zhTitleCache.set(item.title, item.zh.trim());", "if (typeof item.title === 'string' && validChineseTitle(item.zh)) zhTitleCache.set(item.title, String(item.zh).trim());")
patch('src/bootstrap.ts', "{ cache: 'force-cache' }", "{ cache: 'no-cache' }")
patch('src/bootstrap.ts', "import { installGalleryPerformanceRuntime } from './performance-runtime';", "import { installGalleryPerformanceRuntime } from './performance-runtime';\nimport { validChineseTitle } from '../shared/chinese-title-overrides.js';")
patch('src/bootstrap.ts', "      if (title && zh) cached[title] = zh;", "      if (title && validChineseTitle(zh)) cached[title] = zh;")

patch('cloudflare/scripts/audit-literature.mjs', "const TIME_ZONE = 'Asia/Shanghai';", "import { loadScopeCorrections, withScopeCorrections } from '../../scripts/lib/scope-corrections.mjs';\n\nconst TIME_ZONE = 'Asia/Shanghai';")
patch('cloudflare/scripts/audit-literature.mjs', "const missing = reviewableMissing.filter(c => !reviewedExclusions.has(c.doi));", "const missing = reviewableMissing.filter(c => !reviewedExclusions.has(c.doi));\n// Existing wrong cards are not discovered by a missing-DOI-only audit.\n// Add explicit correction candidates without inflating source-family counts.\nconst scopeCorrections = await loadScopeCorrections();\nmissing.splice(0, missing.length, ...withScopeCorrections(missing, scopeCorrections, galleryDois));")
patch('cloudflare/scripts/audit-literature.mjs', "    reviewPriority: retainForReview(c) ? 'high' : 'normal',", "    reviewPriority: c.scopeCorrection || retainForReview(c) ? 'high' : 'normal',")
patch('cloudflare/scripts/audit-literature.mjs', "    unresolved: missing.length,", "    unresolved: missing.length,\n    scopeCorrectionsPending: missing.filter(candidate => candidate.scopeCorrection).length,")
patch('cloudflare/scripts/audit-literature.mjs', "  reviewPriority: candidate.reviewPriority,\n}));", "  reviewPriority: candidate.reviewPriority,\n  ...(candidate.scopeCorrection ? { scopeCorrection: candidate.scopeCorrection } : {}),\n}));")

patch('scripts/validate-prepublish-review.mjs', "const ROOT = process.cwd();", "import { loadScopeCorrections, scopeDecisionFailures } from './lib/scope-corrections.mjs';\n\nconst ROOT = process.cwd();")
patch('scripts/validate-prepublish-review.mjs', "check(Array.isArray(review?.decisions), 'semantic: decisions array missing');", "check(Array.isArray(review?.decisions), 'semantic: decisions array missing');\nfailures.push(...scopeDecisionFailures(decisions, await loadScopeCorrections(ROOT)));")

patch('scripts/apply-fixed-slot-literature-release.mjs', "import { gunzipSync } from 'node:zlib';", "import { gunzipSync, gzipSync } from 'node:zlib';\nimport { chineseTitle, validChineseTitle } from '../shared/chinese-title-overrides.js';\nimport { loadScopeCorrections } from './lib/scope-corrections.mjs';")
patch('scripts/apply-fixed-slot-literature-release.mjs', "  if (old?.titleZh) card.titleZh = old.titleZh;", "  card.titleZh = chineseTitle({ ...row, titleZh: row.titleZh || old?.titleZh });\n  assert(validChineseTitle(card.titleZh), `missing reviewed Chinese title for accepted DOI: ${doi}`);")
patch('scripts/apply-fixed-slot-literature-release.mjs', "const formalPath = bundle.markerFields.reviewFile;", "const scopeCorrections = await loadScopeCorrections(ROOT);\nconst beforeProductionDois = await loadProductionDois();\nfor (const correction of scopeCorrections) {\n  const doi = normalizeDoi(correction.doi);\n  assert(!(bundle.markerFields.publishableDois || []).includes(doi), `explicitly excluded DOI cannot be restored: ${doi}`);\n  if (beforeProductionDois.has(doi)) assert((bundle.markerFields.rejectedDois || []).includes(doi), `live scope correction missing from reviewed release: ${doi}`);\n}\n// Validate titles before writing any formal or production artifact.\nfor (const row of bundle.formalReview.accepted || []) {\n  assert(validChineseTitle(chineseTitle(row)), `missing reviewed Chinese title for accepted DOI: ${row.doi}`);\n}\n\nconst formalPath = bundle.markerFields.reviewFile;")
patch('scripts/apply-fixed-slot-literature-release.mjs', "const productionDois = await loadProductionDois();", "// Remove rejected/deferred entries from every duplicate static input, not only rolling.\nfor (const file of OPTIONAL_SUPPLEMENTS.filter(file => file !== rollingPath)) {\n  let payload;\n  try { payload = await readJson(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }\n  if (!Array.isArray(payload.papers)) continue;\n  const filtered = payload.papers.filter(row => !forbidden.has(normalizeDoi(row.doi || row.url)));\n  if (filtered.length !== payload.papers.length) await writeFile(path.resolve(ROOT, file), pretty({ ...payload, papers: filtered }));\n}\nconst baselinePath = path.resolve(ROOT, 'public/papers.gz.b64');\nconst baselineRows = JSON.parse(gunzipSync(Buffer.from((await readFile(baselinePath, 'utf8')).trim(), 'base64')).toString('utf8'));\nconst baselineKept = baselineRows.filter(row => !forbidden.has(normalizeDoi(row.doi || row.url)));\nif (baselineKept.length !== baselineRows.length) await writeFile(baselinePath, gzipSync(Buffer.from(JSON.stringify(baselineKept))).toString('base64') + '\\n');\n\nconst productionDois = await loadProductionDois();")

# Persist future coverage/regression checks in existing CI, with no new schedule.
patch('.github/workflows/prepublish-review-gate.yml', "      - 'scripts/validate-prepublish-review.mjs'", "      - 'scripts/validate-prepublish-review.mjs'\n      - 'scripts/test-scope-title-corrections.mjs'\n      - 'scripts/lib/scope-corrections.mjs'\n      - 'shared/chinese-title-overrides.js'\n      - 'audit/literature-scope-corrections.json'")
patch('.github/workflows/prepublish-review-gate.yml', "      - name: Locate canonical staging review", "      - name: Test explicit scope corrections and bilingual card titles\n        run: node scripts/test-scope-title-corrections.mjs\n\n      - name: Locate canonical staging review")
print('\n'.join(changed))
