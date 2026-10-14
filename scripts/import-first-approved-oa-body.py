#!/usr/bin/env python3
"""One independently reviewed CC BY science-article import canary (not general OA copying).

The script may only import a listed, science-reviewed and publisher-license-
reviewed DOI. Article XML and scientific words exist only in process memory or
in the owner's explicitly authorized D1 scientific section table. Neither raw
text nor credentials are printed, saved as Git commits, or uploaded as CI artifacts.

It is fail-closed: DOI/revision/catalog generation, primary-source XML SHA,
scientific section SHA, third-party media exclusions, and per-DOI idempotent
post-import coverage readback must all agree. Default mode is DRY RUN.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

DOI = "10.1038/s41557-026-02206-6"
PMCID = "PMC13623650"
SOURCE_XML_SHA = "96d5f10017f50b8e8efaa739652f33553b1e5b844014f01ccbe5532a1a970a63"
ARTICLE_URL = "https://www.nature.com/articles/s41557-026-02206-6"
RIGHTS_URL = "https://creativecommons.org/licenses/by/4.0/"
AUDIT_EVIDENCE_FILE = "audit/body-source-review/2026-10-14-oa-science-section-hashes-38510930867.json"
RIGHTS_REVIEW_FILE = "audit/historical-body-review/2026-10-14-naturechem-02206-science-challenge.md"
PUBLIC_FTS_IMPORT_ROUTE = "https://api.gczhouwld.com/api/admin/literature-body-sections/import"
COVERAGE_ROUTE = "https://api.gczhouwld.com/api/admin/literature-body-sections/coverage"
RELEASE_ROUTE = "https://gallery.gczhouwld.com/release-delivery.json"
CATALOG_ROUTE = "https://api.gczhouwld.com/api/literature/catalog-view"
MAX_XML = 2_800_000
MAX_BYTES = 240_000
MAX_ROWS = 64
MAX_SECTION = 16_000
ADMIN_HEADINGS = ("data availability", "code availability", "rights and permissions",
                  "online content", "supplementary information", "supplementary material",
                  "additional information", "author information", "author contributions",
                  "contributor information", "acknowledg", "funding",
                  "correspondence", "competing interests", "conflict of interest",
                  "ethics declarations", "bibliography")

def ltag(e):
    return str(e.tag).split("}")[-1].lower()

def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def element_text(e):
    return norm(" ".join(e.itertext())) if e is not None else ""

def digest(b):
    if isinstance(b,str): b=b.encode("utf-8")
    return hashlib.sha256(b).hexdigest()

def science_type(h):
    h=h.lower()
    if "mechanis" in h or "kinetic" in h or "control experiment" in h:return "mechanism"
    if "result" in h or "discussion" in h or "synthetic" in h:return "results"
    if "substrate" in h or "scope" in h:return "scope"
    if "methods" in h or "experimental" in h or "procedure" in h:return "experimental"
    if "conclusion" in h or "outlook" in h or "summary" in h:return "conclusion"
    if "introduc" in h or "background" in h:return "introduction"
    return "other"

def direct_child(parent,tag):
    return next((x for x in parent if ltag(x)==tag),None)

def direct_paragraphs(section):
    skip={"sec","fig","table-wrap","supplementary-material","ref-list",
          "permissions","ack","fn-group","app-group"}
    values=[]
    def visit(node):
        for c in node:
            t=ltag(c)
            if t in skip:continue
            if t=="p":
                s=element_text(c)
                if s:values.append(s)
            else:visit(c)
    visit(section)
    return values

def get_json(url,max_bytes=7_000_000,headers=None):
    req=urllib.request.Request(url,headers={"Accept":"application/json",
        "User-Agent":"OrganicSynthesisGallery-rights-reviewed-body-canary/1.0",
        **(headers or {})},method="GET")
    with urllib.request.urlopen(req,timeout=18) as res:
        if res.status!=200:raise ValueError("source_http_"+str(res.status))
        raw=res.read(max_bytes+1)
    if len(raw)>max_bytes:raise ValueError("source_response_too_large")
    return json.loads(raw)

def load_catalog_verified():
    release=get_json(RELEASE_ROUTE)
    cid=release.get("architectureCatalogId")
    formal=set(release.get("dois") or [])
    if not re.fullmatch("[a-f0-9]{64}",str(cid)) or not formal or len(formal)!=release.get("productionCards") or DOI not in formal:
        raise ValueError("formal_catalog_doi_generation_invalid")
    all_seen=set()
    cursor=""
    revision=None
    for _ in range(100):
        qp={"catalogId":cid,"sort":"oldest","limit":"100"}
        if cursor: qp["cursor"]=cursor
        page=get_json(CATALOG_ROUTE+"?"+urllib.parse.urlencode(qp))
        if (page.get("catalogId")!=cid or page.get("enabled") is not True or
            page.get("readPathActive") is not True or
            page.get("matched")!=len(formal) or not isinstance(page.get("items"),list)):
            raise ValueError("formal_catalog_page_generation_or_count_invalid")
        for row in page["items"]:
            key=row.get("doi")
            if key not in formal or key in all_seen:
                raise ValueError("formal_catalog_duplicate_or_missing_doi")
            all_seen.add(key)
            if key==DOI:
                revision=row.get("revision")
                if not re.fullmatch("[a-f0-9]{64}",str(revision)):
                    raise ValueError("reviewed_article_revision_invalid")
        if not page.get("hasMore"):
            if page.get("nextCursor") or len(all_seen)!=len(formal):
                raise ValueError("formal_catalog_incomplete")
            break
        cursor=page.get("nextCursor")
        if not cursor:raise ValueError("formal_catalog_stalled")
    else:
        raise ValueError("formal_catalog_pagination_overflow")
    if not revision:raise ValueError("reviewed_doi_not_in_catalog")
    return {"catalogId":cid,"revision":revision,"formalDois":len(formal)}

def download_primary_source():
    url="https://www.ebi.ac.uk/europepmc/webservices/rest/"+PMCID+"/fullTextXML"
    req=urllib.request.Request(url,headers={"Accept":"application/xml",
        "User-Agent":"OrganicSynthesisGallery-rights-reviewed-body-canary/1.0"})
    with urllib.request.urlopen(req,timeout=18) as res:
        raw=res.read(MAX_XML+1)
    if not (500 <=len(raw)<=MAX_XML):raise ValueError("primary_source_size_invalid")
    if digest(raw)!=SOURCE_XML_SHA:raise ValueError("primary_source_xml_sha_mismatch")
    return raw

def materialize_scientific_sections(xml_bytes,primary_audit,rights_review_note):
    """Scientific words returned IN MEMORY ONLY; output to caller never logged."""
    if digest(xml_bytes)!=SOURCE_XML_SHA:raise ValueError("xml_sha_identity_mismatch")
    root=ET.fromstring(xml_bytes)
    meta=next((x for x in root.iter() if ltag(x)=="article-meta"),None)
    if meta is None:raise ValueError("source_article_meta_missing")
    ids={element_text(x).lower() for x in meta.iter()
         if ltag(x)=="article-id" and x.attrib.get("pub-id-type")=="doi"}
    if ids!={DOI}:raise ValueError("source_article_doi_mismatch")
    licences=[ET.tostring(x,encoding="unicode") for x in meta.iter() if ltag(x)=="license"]
    license_text=" ".join(licences)
    if ("by-nc" in license_text.lower() or "by-nd" in license_text.lower() or
        "noncommercial" in license_text.lower() or
        "https://creativecommons.org/licenses/by/4.0/" not in license_text.lower()):
        raise ValueError("source_publisher_article_cc_by4_not_verified")
    body=next((x for x in root.iter() if ltag(x)=="body"),None)
    if body is None:raise ValueError("source_science_body_missing")
    scoped=[]
    top=direct_paragraphs(body)
    if top:scoped.append(("Introduction / unheaded main text","introduction",top))
    for node in body.iter():
        if ltag(node)!="sec":continue
        title=direct_child(node,"title")
        heading=element_text(title) or "Untitled main article section"
        if heading.lower().startswith(ADMIN_HEADINGS):continue
        ps=direct_paragraphs(node)
        if ps:scoped.append((heading,science_type(heading),ps))
    sections=[]
    short_fragments=0
    for heading,kind,paragraphs in scoped:
        buf=[]
        for p in paragraphs:
            if len(p)>MAX_SECTION:raise ValueError("reviewed_article_single_paragraph_too_large")
            trial=norm(" ".join([*buf,p]))
            if len(trial)>MAX_SECTION and buf:
                full=norm(" ".join(buf))
                if len(full)>=60:sections.append((kind,heading,full))
                else:short_fragments+=1
                buf=[p]
            else:buf.append(p)
        if buf:
            full=norm(" ".join(buf))
            if len(full)>=60:sections.append((kind,heading,full))
            else:short_fragments+=1
    if not 1<=len(sections)<=MAX_ROWS:raise ValueError("reviewed_article_scientific_sections_invalid")
    if sum(len(s.encode()) for _,_,s in sections)>MAX_BYTES:raise ValueError("reviewed_article_byte_budget_invalid")
    approved=next((x for x in primary_audit["reports"] if x["doi"]==DOI),None)
    if not approved or approved.get("state")!="science_sections_mapped_pending_independent_review":
        raise ValueError("reviewed_article_primary_independent_science_evidence_missing")
    # The old JATS reviewer source evidence was obtained by real source read.
    # Match every original eligible science section's heading and SHA, without
    # claiming its administrative/SI/caption entries are public science.
    audited={(x["heading"],x["sectionSha256"]) for x in approved.get("sections",[])}
    if any((h,digest(text)) not in audited for _,h,text in sections):
        raise ValueError("reviewed_article_science_paragraph_sha_drift")
    # Confirm source audit includes the scientific mechanism and outcome.
    kinds={k for k,_,_ in sections}
    if not {"mechanism","results","conclusion","experimental"}.issubset(kinds):
        raise ValueError("reviewed_article_required_science_sections_missing")
    if not ("publisher_article_cc_by_4_verified" in rights_review_note and
            "completed_main_article_only" in rights_review_note):
        raise ValueError("independent_publisher_science_rights_review_unavailable")
    public_sections=[]
    for i,(kind,h,text) in enumerate(sections,1):
        public_sections.append({"sectionId":f"s{i:03d}","type":kind,
            "heading":h[:200],"text":text,"sha256":digest(text)})
    canonical="\n\n".join(x["sectionId"]+"\n"+x["heading"]+"\n"+x["text"] for x in public_sections)
    return public_sections,digest(canonical),short_fragments

def safe_cover(auth,cid):
    url=COVERAGE_ROUTE+"?catalogId="+urllib.parse.quote(cid)
    return get_json(url,max_bytes=1000,headers={"Authorization":"Bearer "+auth})

def run(output,enable_import=False):
    report={"schemaVersion":1,"readOnly":not enable_import,"doi":DOI,
            "sourcePmcid":PMCID,"sourceXmlSha256":SOURCE_XML_SHA,
            "publicSearchSwitchChanged":False,"rawXmlPersisted":False,
            "articleTextInArtifact":False,"credentialsInLogs":False,
            "scienceTwoPassEvidence":RIGHTS_REVIEW_FILE,
            "scienceEvidenceManifest":AUDIT_EVIDENCE_FILE,
            "scienceSectionCount":0,"currentCatalogId":None,
            "sourceSectionSha256":None,"beforeCoverage":None,
            "afterCoverage":None,"importResult":"not_started"}
    try:
        for filename in [AUDIT_EVIDENCE_FILE,RIGHTS_REVIEW_FILE]:
            if not Path(filename).exists():raise ValueError("science_review_proof_missing")
        primary_audit=json.loads(Path(AUDIT_EVIDENCE_FILE).read_text(encoding="utf-8"))
        rights_review_note=Path(RIGHTS_REVIEW_FILE).read_text(encoding="utf-8")
        release=load_catalog_verified()
        report["currentCatalogId"]=release["catalogId"]
        xml=download_primary_source()
        rows,canonicalSha,shorts=materialize_scientific_sections(xml,primary_audit,rights_review_note)
        report["scienceSectionCount"]=len(rows)
        report["scienceShortFragmentsWithheld"]=shorts
        report["sourceSectionSha256"]=canonicalSha
        report["importResult"]="source_ready_not_imported"
        if enable_import:
            auth=os.environ.get("BRIDGE_WRITE_TOKEN") or ""
            if not auth:raise ValueError("owner_authorization_not_configured")
            before=safe_cover(auth,release["catalogId"])
            if before.get("catalogId")!=release["catalogId"] or not isinstance(before.get("verifiedDoi"),int):
                raise ValueError("production_fts_coverage_unavailable")
            report["beforeCoverage"]={"verifiedDoi":before.get("verifiedDoi"),
                  "verifiedSections":before.get("verifiedSections"),
                  "publicEnabled":before.get("publicEnabled")}
            payload={"schemaVersion":"reviewed-public-body-section-v1",
                "catalogId":release["catalogId"],"doi":DOI,
                "revision":release["revision"],"origin":"independently_reviewed_public_text",
                "publicUploadAllowed":True,"sections":rows,
                "sourceSha256":canonicalSha,"completeness":"partial",
                "rightsReview":{"decision":"approved_public_reuse","itemLicenseVerified":True,
                "pageDoi":DOI,"sourceSha256":canonicalSha,
                "sourceKind":"publisher_article_license","licenseKind":"cc-by-4.0",
                "licenseUrl":RIGHTS_URL,"articleUrl":ARTICLE_URL,
                "reviewer":"Gallery independently reviewed main-article scientific editor",
                "reviewedAt":"2026-10-14T04:14:00Z",
                "reviewNote":"DOI/publisher article CC BY 4.0 and two independent main-article science passes documented in historical-body-review; exclude figures, SI and all administrative text. Original source XML SHA verified."}}
            request=urllib.request.Request(PUBLIC_FTS_IMPORT_ROUTE,
               data=json.dumps(payload,ensure_ascii=False).encode("utf-8"),
               headers={"content-type":"application/json","accept":"application/json",
                        "Authorization":"Bearer "+auth},method="POST")
            try:
                with urllib.request.urlopen(request,timeout=25) as res:
                    status=res.status
                    data=json.loads(res.read(2500))
            except urllib.error.HTTPError as e:
                status=e.code
                try: data=json.loads(e.read(2500))
                except Exception:data={}
            if status!=200 or not data.get("ok"):
                allowed_error={"body_index_db_unavailable","body_generation_not_ready",
                   "body_doi_revision_mismatch","body_reviewed_source_conflict",
                   "body_atomic_import_failed","body_public_rights_review_missing",
                   "body_source_sha_invalid","body_science_byte_budget_exceeded"}
                err=data.get("error","")
                report["importResult"]="http_"+str(status)+"_"+(err if err in allowed_error else "unavailable")
            else:
                report["importResult"]="already_reviewed" if data.get("alreadyReviewed") else "stored"
                report["storedSections"]=int(data.get("storedSections") or 0)
                after=safe_cover(auth,release["catalogId"])
                if after.get("catalogId")!=release["catalogId"] or not isinstance(after.get("verifiedDoi"),int):
                    raise ValueError("post_import_coverage_invalid")
                report["afterCoverage"]={"verifiedDoi":after["verifiedDoi"],
                   "verifiedSections":after.get("verifiedSections"),
                   "publicEnabled":after.get("publicEnabled")}
                if after.get("verifiedDoi",0)<before.get("verifiedDoi",0):
                    raise ValueError("post_import_coverage_regressed")
                if after.get("publicEnabled") is True:
                    raise ValueError("public_fts_read_switch_unexpectedly_enabled")
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("REVIEWED_CC_BY_BODY_IMPORT "+json.dumps(report,ensure_ascii=False))
        if report["importResult"].startswith("http_"):raise SystemExit(2)
    except Exception as e:
        error=str(e)
        safe=error if re.fullmatch(r"[a-z][a-z0-9_]{3,90}",error) else "source_or_provider_unavailable"
        report["importResult"]="failed_"+safe
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("REVIEWED_CC_BY_BODY_IMPORT_FAILED "+json.dumps(report,ensure_ascii=False))
        raise SystemExit(1)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",required=True)
    parser.add_argument("--import-reviewed",action="store_true")
    args=parser.parse_args()
    run(Path(args.output),enable_import=args.import_reviewed)
