#!/usr/bin/env python3
"""Source-backed missing-author repair for this exact already-published DOI only.
No dates, scope decisions, counts, article content or other DOI records change.
"""
import copy, importlib.util, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
DOI='10.1038/s41586-026-11242-8'
AUTHORS=['Hayato Fujimoto','Masayuki Mizutani','Kazuya Imachi','Teruki Nishioka','Reona Ikeda','Mamoru Tobisu']
FILES=('rolling-supplement.json','literature-supplement.json','automation-supplement.json','curated-supplement.json','final-audit-supplement.json','manual-supplement.json','total-synthesis.json')
changes=[];found=0
for name in FILES:
    path=ROOT/'public'/name
    if not path.exists():continue
    raw=json.loads(path.read_text(encoding='utf8'));before=copy.deepcopy(raw)
    records=raw if isinstance(raw,list) else next((raw[k] for k in ('papers','items','records') if isinstance(raw,dict) and isinstance(raw.get(k),list)),[])
    changed=False
    for record in records:
        if not isinstance(record,dict) or str(record.get('doi','')).lower().replace('https://doi.org/','')!=DOI:continue
        found+=1
        if record.get('authors'):
            continue
        assert 'spirofusion' in str(record.get('title','')).lower(), 'Unexpected selected Nature record'
        record['authors']=AUTHORS[:];changed=True
    if changed:
        # Exact identity and field checks: deleting the inserted fields restores original content.
        restored=copy.deepcopy(raw)
        rr=restored if isinstance(restored,list) else next(restored[k] for k in ('papers','items','records') if isinstance(restored.get(k),list))
        bb=before if isinstance(before,list) else next(before[k] for k in ('papers','items','records') if isinstance(before.get(k),list))
        for a,b in zip(rr,bb):
            if a!=b:
                assert a.get('doi')==b.get('doi')==DOI
                if 'authors' in b:a['authors']=b['authors']
                else:a.pop('authors',None)
        assert restored==before,'Unexpected collateral metadata change'
        path.write_text(json.dumps(raw,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        changes.append(str(path.relative_to(ROOT)))
assert found>0,'Already released Nature DOI absent; refuse to insert a new paper'
audit=ROOT/'audit/wechat-working/2026-10-15-r1-nature-science'
audit.mkdir(parents=True,exist_ok=True)
(audit/'author-metadata-source-correction.json').write_text(json.dumps({'doi':DOI,'source':'User-supplied Nature Accelerated Article Preview, PDF page 2, authors line3-4','authors':AUTHORS,'changedPaths':changes,'onlyChangedField':'authors','newDOIsAdded':0,'publicationDatesChanged':False,'reason':'Publisher completeness check found no authors for the selected already-released DOI'},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
spec=importlib.util.spec_from_file_location('reviewed_pair_import',ROOT/'scripts/wechat-oct15-import-reviewed-pair.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.main()
