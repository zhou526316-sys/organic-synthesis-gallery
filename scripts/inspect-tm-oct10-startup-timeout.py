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
print("TM_OCT10_BOOTSTRAP_FORENSICS "+json.dumps(report,ensure_ascii=False,separators=(",",":")),flush=True)
