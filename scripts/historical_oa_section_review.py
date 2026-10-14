#!/usr/bin/env python3
"""DOI-bound official JATS science-structure evidence; original body text never exported."""
import argparse, hashlib, json, re, sys, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

def tag(e):return e.tag.rsplit("}",1)[-1]
def val(e):return re.sub(r"\s+"," "," ".join(e.itertext())).strip() if e is not None else ""
def sha(b):return hashlib.sha256(b).hexdigest()
def child(e,name):return next((x for x in e if tag(x)==name),None) if e is not None else None
def section_type(title):
    s=title.lower()
    if re.search(r"mechanis|kinetic|control experiment|spectroscop",s):return "mechanism"
    if re.search(r"result|discussion|synthes|synthetic|substrate|scope|optimization",s):return "results"
    if re.search(r"experiment|methods|procedure",s):return "experimental"
    if re.search(r"introduct|background",s):return "introduction"
    if re.search(r"conclusion|summary|outlook",s):return "conclusion"
    return "other"

def inspect(raw,target):
    if len(raw)>2600000 or sha(raw)!=target["xmlSha256"]:raise ValueError("source_sha_mismatch")
    root=ET.fromstring(raw)
    if tag(root)!="article":raise ValueError("source_not_jats")
    meta=next((x for x in root.iter() if tag(x)=="article-meta"),None)
    if meta is None:raise ValueError("source_metadata_missing")
    ids={val(x).lower() for x in meta.iter() if tag(x)=="article-id" and x.get("pub-id-type")=="doi"}
    if ids!={target["doi"]}:raise ValueError("source_doi_mismatch")
    licences=[x for x in meta.iter() if tag(x)=="license"]
    if not licences:raise ValueError("source_license_missing")
    statement=" ".join(" ".join(list(x.attrib.values())+[val(x)]) for x in licences).lower()
    if re.search(r"by-nc|by-nd|noncommercial|no.derivative|all rights reserved",statement):
        raise ValueError("source_reuse_restricted")
    pattern=r"https?://creativecommons\.org/(licenses/by/(?:3\.0|4\.0)|publicdomain/zero/1\.0)/?"
    licences_found=set(re.findall(pattern,statement))
    names={"licenses/by/4.0":"cc-by-4.0","licenses/by/3.0":"cc-by-3.0","publicdomain/zero/1.0":"cc0-1.0"}
    if {names[x] for x in licences_found}!={target["licenseKind"]}:
        raise ValueError("source_license_mismatch")
    body=child(root,"body")
    if body is None:raise ValueError("source_body_missing")
    units=[]
    for sec in body.iter():
        if tag(sec)!="sec":continue
        heading=val(child(sec,"title"))[:180] or "Untitled science section"
        chunks=[val(x) for x in sec if tag(x) in ("p","list","def-list","boxed-text","disp-quote")]
        units.append((section_type(heading),heading,"\n\n".join(t for t in chunks if t)))
    for x in body.iter():
        kind=tag(x)
        if kind not in ("fig","table-wrap"):continue
        caption=val(child(x,"caption"))
        if caption:units.append(("figure_caption" if kind=="fig" else "table",
                                 val(child(x,"label"))[:180] or kind,caption))
    if not units:raise ValueError("source_structure_missing")
    rows=[]
    for i,(typ,head,text) in enumerate(units,1):
        rows.append({"sectionId":"s"+str(i).zfill(3),"type":typ,"heading":head,"chars":len(text),
                     "sha256":sha(text.encode("utf8")),"lengthEligible":60<=len(text)<=16000})
    canonical="\n\n".join("s"+str(i).zfill(3)+"\n"+h+"\n"+t for i,(_,h,t) in enumerate(units,1))
    return {"doi":target["doi"],"pmcid":target["pmcid"],"sourceXmlSha256":sha(raw),
            "licenseKind":target["licenseKind"],"rightsState":"science_review_pending",
            "units":rows,"sourceUnits":len(rows),
            "figureUnits":sum(x["type"]=="figure_caption" for x in rows),
            "tableUnits":sum(x["type"]=="table" for x in rows),
            "candidateSourceSha256":sha(canonical.encode("utf8")),
            "indexBudgetEligible":len(rows)<=64 and all(x["lengthEligible"] for x in rows)
                 and sum(len(t.encode("utf8")) for _,_,t in units)<=240000,
            "rawOriginalPersisted":False,"publicIndexWrites":0}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def fetch(pmcid):
    if not re.fullmatch(r"PMC\d{4,12}",pmcid):raise ValueError("source_pmcid_invalid")
    url="https://www.ebi.ac.uk/europepmc/webservices/rest/"+pmcid+"/fullTextXML"
    req=urllib.request.Request(url,headers={"Accept":"application/xml"})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=18) as response:
        body=response.read(2600001)
    if len(body)>2600000:raise ValueError("source_too_large")
    return body
def main():
    p=argparse.ArgumentParser();p.add_argument("--targets",required=True);p.add_argument("--output",required=True)
    a=p.parse_args();targets=json.loads(Path(a.targets).read_text(encoding="utf8"))["items"]
    if not 1<=len(targets)<=2:raise ValueError("target_count_invalid")
    output={"schemaVersion":"historical-oa-chapter-fingerprints-v1","readOnly":True,
            "rawOriginalPersisted":0,"publicIndexWrites":0,"items":[]}
    for t in targets:
        try:output["items"].append(inspect(fetch(t["pmcid"]),t))
        except Exception as e:
            reason=str(e);output["items"].append({"doi":t["doi"],"status":"held",
                 "reason":reason if reason.startswith("source_") else "source_unavailable"})
    output["passed"]=sum("units" in row for row in output["items"])
    Path(a.output).write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("OA_SECTION_FINGERPRINT_RESULT "+json.dumps({"passed":output["passed"],"total":len(targets),
        "sectionCounts":[x.get("sourceUnits",0) for x in output["items"]],
        "holds":[x["doi"] for x in output["items"] if "reason" in x]}))
    if output["passed"]!=len(targets):sys.exit(1)
if __name__=="__main__":main()
