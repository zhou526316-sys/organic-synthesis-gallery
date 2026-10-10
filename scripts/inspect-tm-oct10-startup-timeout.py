#!/usr/bin/env python3
"""Read-only, bounded inspection of a previously uploaded owner diagnostic.
Never print credentials, URLs with querystrings, cookies or arbitrary source HTML.
"""
import json, sys, datetime
from pathlib import Path
p=Path(sys.argv[1])
assert p.is_file() and p.stat().st_size<12_000_000, "diagnostic absent or oversized"
d=json.loads(p.read_text(encoding="utf-8-sig"))
assert isinstance(d,dict), "invalid owner diagnostic shape"
s=d.get("summary") if isinstance(d.get("summary"),dict) else {}
def val(row,key,limit=240):
    item=row.get(key) if isinstance(row,dict) else None
    if isinstance(item,str):
        if any(x in item.lower() for x in ("bearer ", "authorization:", "cookie:", "token=")):
            return "[sensitive-redacted]"
        return item.replace("\n"," ").replace("\r"," ")[:limit]
    return item if isinstance(item,(int,float,bool)) else None
def fields(r,keys):
    return {k:v for k in keys if (v:=val(r,k)) is not None}
summary_fields=[
 "version","installRevision","controllerRevision","controllerRunId",
 "phase","status","stopReason","reason","startedAt","finishedAt",
 "queueGeneratedAt","latestAddedDate","queueTotal","scopeCount",
 "total","success","failed","partial","skipped","aborted",
 "fullyResolved","visitedCount","attemptCount","pendingMissing","unresolvedCount","blockedCount",
 "inventoryFreshPending","inventoryWarmStart","inventoryCacheAgeMs","inventoryReadAt",
 "ownerPdfInventoryState","inventoryUnknown","tocStored","figuresStaged","evidenceStored"
]
layers=s.get("inventoryProgress")
if not isinstance(layers,dict):layers={}
if not layers and isinstance(s.get("inventoryLayers"),dict):layers=s["inventoryLayers"]
progress={}
for k,v in layers.items():
    if not isinstance(v,dict):continue
    progress[str(k)[:60]]=fields(v,["state","status","startedAt","finishedAt","lastAt","attempt","elapsedMs","reason","detail","error","transport"])
def errors(name):
    arr=s.get(name)
    if not isinstance(arr,list):return []
    return [str(e).replace("\n"," ")[:230] for e in arr[:12] if isinstance(e,(str,int,float))]
def recent_results():
    arr=s.get("results")
    if not isinstance(arr,list):return []
    return [fields(x,["doi","status","reason","startedAt","finishedAt","tocStored","figuresStaged"])
      for x in arr[-8:] if isinstance(x,dict)]
def trace_headers():
    traces=d.get("traces")
    if not isinstance(traces,list):return []
    filtered=[]
    for t in traces:
        if not isinstance(t,dict):continue
        finished=str(t.get("finishedAt") or "")
        if finished.startswith("2026-10-10") or str(t.get("doi")) in ("10.1021/jacs.6c17448",):
            filtered.append(fields(t,["doi","status","reason","finishedAt"]))
    return filtered[-10:]
report={
 "readAtUTC":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "ownerUpload":fields(d,["uploadedAt","version","source","kind","uploadedReason","total"]),
 "topLevelKeys":sorted(str(k) for k in d.keys())[:32],
 "summaryKeys":sorted(str(k) for k in s.keys())[:100],
 "summary":fields(s,summary_fields),
 "inventoryProgress":progress,
 "inventoryErrors":errors("inventoryErrors"),
 "coverageErrors":errors("errors"),
 "activeJob":fields(d.get("activeJob"),["doi","publisher","version","startedAt","status","reason"]),
 "pageProgress":fields(d.get("progress"),["doi","status","reason","at","atIso"]),
 "publisherHeartbeat":fields(d.get("publisherHeartbeat"),["doi","status","at","atIso"]),
 "newestResults":recent_results(),
 "recentTraces":trace_headers(),
 "readOnly":True,"publisherRequests":0,"productionWrites":0
}

# Bounded latest-run publisher/access evidence. No arbitrary messages, URLs, or user credentials.
import re
def compact_preview(label):
    rows=s.get(label)
    if not isinstance(rows,list):return []
    return [fields(r,["doi","publisher","need","until","reason"]) for r in rows[:12] if isinstance(r,dict)]
def publisher_access_trace():
    traces=d.get("traces")
    if not isinstance(traces,list):return []
    out=[]
    for t in traces:
        if not isinstance(t,dict) or t.get("doi")!="10.1039/d6gc03748h":continue
        events=t.get("trace") if isinstance(t.get("trace"),list) else []
        for row in events:
            if not isinstance(row,dict):continue
            if str(row.get("stage") or "") not in ("page","publisher_access","rsc_native_abstract_ajax","page_preflight"):continue
            info=fields(row,["stage","event","status","httpStatus","at"])
            msg=str(row.get("message") or "")
            safe=re.search(r"doiMatch=(?:true|false);textLength=\d+;accessGate=(?:true|false)",msg,re.I)
            if safe:info["identityAndGate"]=safe.group(0)
            ms=re.search(r"cooldownMs=\d+;until=\d+",msg)
            if ms:info["cooldownTimer"]=ms.group(0)
            out.append(info)
    return out[-32:]
report["cooldownSummary"]={
 "deferredCount":val(s,"deferredCount"),"deferredNextAt":val(s,"deferredNextAt"),
 "deferredPreview":compact_preview("deferredPreview"),
 "blockedPreview":compact_preview("blockedPreview"),
 "remainingNeeds":s.get("remainingNeeds") if isinstance(s.get("remainingNeeds"),dict) else {},
 "ownerPdfInventory":s.get("ownerPdfInventory") if isinstance(s.get("ownerPdfInventory"),dict) else {}
}
report["rscPageAccessTrace"]=publisher_access_trace()


# Follow-up: the owner's 2026-10-10 2.2.79 run. Strict DOI/status/stage only.
# No raw source HTML, candidate URLs, page titles, image bytes or private credentials.
def safe_enum(value):
    return str(value or "").strip().lower()[:48] if re.fullmatch(r"[a-z0-9_:\-+.]{1,48}",str(value or "").lower()) else ""
def safe_doi(value):
    v=str(value or "").lower()
    return v if re.fullmatch(r"10\.\d{4,9}/[a-z0-9_.\-]{2,85}",v) else ""
def reason_codes(value):
    v=str(value or "").lower()
    patterns=["publisher_access_gate","page_doi_unverified","page_doi_mismatch",
      "private_pdf_http_403","private_pdf_http_401","private_pdf_http_429",
      "private_pdf_not_found","no_usable_official_or_figure1",
      "gm_request_timeout","controller_timeout","receipt_invalid",
      "media_source_doi_mismatch","owner_cloud_inventory_ready",
      "publisher_access_cooldown","user_aborted","not_found",
      "image_upload_budget_exhausted","upload_http_503",
      "evidence_failed","image_http_403"]
    return [p for p in patterns if p in v]
def output_result(r):
    if not isinstance(r,dict):return {}
    ans={"doi":safe_doi(r.get("doi")),"status":safe_enum(r.get("status")),
         "codes":reason_codes(r.get("reason")),"figuresStaged":val(r,"figuresStaged")}
    for dest,name in (("toc","toc"),("figures","figures"),("fulltext","fulltext"),("privatePdf","privatePdf")):
        x=r.get(name)
        if isinstance(x,dict):
            obj={"status":safe_enum(x.get("status"))}
            for k in ("discovered","stored","failed","expectedFigureCount"):
                v=x.get(k)
                if isinstance(v,(int,float)) and 0<=v<=500:obj[k]=v
            ans[dest]=obj
    return ans
rows=s.get("results") if isinstance(s.get("results"),list) else []
latest={}
for entry in rows[:120]:
    if isinstance(entry,dict):
        doi=safe_doi(entry.get("doi"))
        if doi:latest[doi]=output_result(entry)
report["runResultCohort"]={
 "attemptCount":len(rows),
 "lastPerDoi":list(latest.values())[-40:],
 "outcomes":{status:sum(r.get("status")==status for r in latest.values())
             for status in ("success","partial","failed","aborted")},
}
def relevant_traces():
    traces=d.get("traces") if isinstance(d.get("traces"),list) else []
    out=[]
    for t in traces[:30]:
        if not isinstance(t,dict):continue
        doi=safe_doi(t.get("doi"))
        if not doi:continue
        events=t.get("trace") if isinstance(t.get("trace"),list) else []
        kind="rsc" if doi.startswith("10.1039/") else "other"
        count={}
        focus=[]
        for ev in events[-170:]:
            if not isinstance(ev,dict):continue
            stage=safe_enum(ev.get("stage"))
            event=safe_enum(ev.get("event"))
            status=safe_enum(ev.get("status"))
            if not stage:continue
            if stage in ("rsc_native_abstract_ajax","rsc_listing_html","iframe_dom_scan",
                 "candidate_discovery","figure_discovery","toc_filter_summary",
                 "figure_filter_summary","capture_plan","publisher_access",
                 "page_fetch","gm_fetch","r2_upload","figure_stage",
                 "capture_timing"):
                count[stage]=count.get(stage,0)+1
                if stage in ("rsc_native_abstract_ajax","rsc_listing_html",
                     "candidate_discovery","figure_discovery","toc_filter_summary",
                     "figure_filter_summary","r2_upload","figure_stage","publisher_access"):
                    row={"stage":stage,"event":event,"status":status}
                    code=ev.get("httpStatus")
                    if isinstance(code,(int,float)) and code in (401,403,404,408,429,500,502,503,504):row["httpStatus"]=int(code)
                    msg=str(ev.get("message") or "")
                    whitelisted=re.findall(r"(?:accepted|semanticImages|candidates|imageCount|official|figure1|figureCount|scanned|usable|rejected|discovered|stored)=\d+",msg)
                    if whitelisted:row["metrics"]=whitelisted[:8]
                    focus.append(row)
        if kind=="rsc" or focus:
            out.append({"doi":doi,"kind":kind,"status":safe_enum(t.get("status")),
               "stageCounts":count,"focus":focus[-14:]})
    return out[-25:]
report["perDoiTraceSummary"]=relevant_traces()

print("TM_OCT10_BOOTSTRAP_FORENSICS "+json.dumps(report,ensure_ascii=False,separators=(",",":")),flush=True)
