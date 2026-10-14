#!/usr/bin/env python3
"""Import ONE independently verified CC BY primary science text into reviewed FTS.

The original publisher manuscript is fetched in memory from Europe PMC and is
never committed, printed, persisted as a CI artifact, sent to untrusted hosts,
or mixed with supplementary figures/PDF. All extracted paragraphs must match
a previously audited DOI-bound, SHA-checked scientific section manifest byte
for byte. Actual production mutation is allowed only with --mode=import and
an owner-provided GitHub Actions secret.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

DOI = "10.1038/s41557-026-02206-6"
PMCID = "PMC13623650"
PUBLISHER = "https://www.nature.com/articles/s41557-026-02206-6"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
SOURCE_MANIFEST = pathlib.Path("audit/body-source-review/2026-10-14-oa-science-section-hashes-38512095078.json")
SOURCE_LEDGER = pathlib.Path("audit/body-source-full/census-38507374312-f263e943427a.json")
SCIENCE_WORKLIST = pathlib.Path("audit/body-source-review/2026-10-14-all-formal-oa-review-worklist.json")
SCIENCE_CHALLENGE = pathlib.Path("audit/historical-body-review/2026-10-14-naturechem-02206-science-challenge.md")
RELEASE = "https://gallery.gczhouwld.com/release-delivery.json"
API = "https://api.gczhouwld.com"
USER_AGENT = "OrganicSynthesisGallery-reviewed-science-fts/1.0"
SOURCE = pathlib.Path(__file__).with_name("historical-oa-science-evidence.py")

spec = importlib.util.spec_from_file_location("reviewed_source", SOURCE)
science = importlib.util.module_from_spec(spec)
spec.loader.exec_module(science)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None

def safe_request(url, *, method="GET", payload=None, bearer=None, max_bytes=3_000_000, accept="application/json"):
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or u.hostname not in (
        "www.ebi.ac.uk", "gallery.gczhouwld.com", "api.gczhouwld.com"
    ) or u.username or u.password or u.fragment:
        raise ValueError("source_origin_not_allowlisted")
    headers = {"Accept":accept, "User-Agent":USER_AGENT}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    req = urllib.request.Request(url, headers=headers, data=payload, method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=18) as resp:
            if resp.status != 200:
                raise ValueError("source_response_not_successful")
            data = resp.read(max_bytes+1)
            if len(data)>max_bytes:
                raise ValueError("source_exceeds_allowed_bytes")
            return data
    except urllib.error.HTTPError as error:
        # Never log a bearer token or the provider's raw error response.
        raise ValueError("source_http_"+str(error.code)) from None
    except (urllib.error.URLError,TimeoutError):
        raise ValueError("source_connection_failed") from None

def safe_json(url, *, bearer=None):
    b = safe_request(url,bearer=bearer,accept="application/json")
    try: return json.loads(b)
    except (UnicodeDecodeError,json.JSONDecodeError):
        raise ValueError("source_json_invalid") from None

def source_record():
    report=json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    article=next((x for x in report["reports"] if x["doi"]==DOI),None)
    if article is None or article["state"]!="science_sections_mapped_pending_independent_review":
        raise ValueError("reviewed_science_source_unavailable")
    if article["shortScienceFragmentCount"]!=0 or article["completenessCandidate"]!="complete_candidate":
        raise ValueError("reviewed_science_sections_not_import_ready")
    if not 1<=len(article["sections"])<=64:
        raise ValueError("reviewed_science_section_count_invalid")
    work=json.loads(SCIENCE_WORKLIST.read_text(encoding="utf-8"))
    selected=next((x for x in work["articles"] if x["doi"]==DOI),None)
    if not selected or selected["scientificChallengePass"]!="completed_main_article_only" or (
        selected["articleLicenseIndependentReview"]!="publisher_article_cc_by_4_verified_text_scope_only"
    ):
        raise ValueError("independent_science_and_license_reviews_missing")
    if selected.get("publicFtsIngested") is not False:
        raise ValueError("review_worklist_already_marked_indexed")
    if selected["pmcid"]!=PMCID or selected["xmlSha256"]!=article["xmlSha256"]:
        raise ValueError("source_worklist_xml_identity_conflict")
    challenge=SCIENCE_CHALLENGE.read_text(encoding="utf-8")
    if "main_article_science_challenge_pass" not in challenge or "article_level_cc_by_4_verified" not in challenge:
        raise ValueError("independent_source_challenge_record_missing")
    ledger=json.loads(SOURCE_LEDGER.read_text(encoding="utf-8"))
    first=next((x for x in ledger["doiLedger"] if x["doi"]==DOI),None)
    if not first or first["sourceStatus"]!="needs_independent_review" or (
        first["sourceXmlSha256"]!=selected["xmlSha256"]
    ):
        raise ValueError("source_original_generation_evidence_missing")
    return article,first

def extract_exact_sections(xml_bytes,source_item):
    # Run original JATS DOI/CC BY/XML SHA verifier FIRST.
    evidence=science.parse_science_jats(xml_bytes,DOI,source_item["xmlSha256"])
    if (evidence["canonicalSectionsSha256"]!=source_item["canonicalSectionsSha256"] or
        evidence["scienceSectionUnits"]!=len(source_item["sections"]) or
        evidence["shortScienceFragmentCount"]!=0 or
        evidence["licenseKindSignal"]!="cc-by-4.0"):
        raise ValueError("original_scientific_source_evidence_changed")
    root=ET.fromstring(xml_bytes)
    body=next((x for x in root.iter() if science.lname(x.tag)=="body"),None)
    if body is None:
        raise ValueError("science_body_missing")
    excluded=("data availability","code availability","rights and permissions",
      "additional information","ethics declarations","author information",
      "acknowledgements","acknowledgments","funding information",
      "conflict of interest","competing interests","supplementary information",
      "supplementary material","online content","author contributions",
      "contributor information","funding","correspondence","bibliography",
      "conflict of interests","declaration of competing interest")
    groups=[]
    top=science.direct_science_paragraphs(body)
    if top: groups.append(("Introduction / unheaded main text","introduction",top))
    for sec in body.iter():
        if science.lname(sec.tag)!="sec":
            continue
        h=science.element_text(science.find_direct_child(sec,"title")) or "Untitled main article section"
        if h.lower().startswith(excluded):
            continue
        text=science.direct_science_paragraphs(sec)
        if text:
            groups.append((h,science.kind(h),text))
    actual=[]
    for heading,category,paragraphs in groups:
        pieces=[]
        for paragraph in paragraphs:
            if len(paragraph)>science.MAX_SECTION_CHARS:
                raise ValueError("unreviewed_scientific_paragraph_too_large")
            trial=science.norm(" ".join([*pieces,paragraph]))
            if len(trial)>science.MAX_SECTION_CHARS and pieces:
                normalized=science.norm(" ".join(pieces))
                actual.append((category,heading,normalized))
                pieces=[paragraph]
            else:
                pieces.append(paragraph)
        if pieces:
            actual.append((category,heading,science.norm(" ".join(pieces))))
    if len(actual)!=len(source_item["sections"]):
        raise ValueError("reviewed_section_count_changed")
    sections=[]
    for i, ((kind,heading,text),saved) in enumerate(zip(actual,source_item["sections"],strict=True),1):
        section_id="s"+str(i).zfill(3)
        typ=kind if kind in {"results","scope","mechanism","experimental","introduction","conclusion","other"} else "other"
        heading=heading[:200]
        digest=science.digest(text)
        if (saved["sectionId"]!=section_id or saved["type"]!=typ or
            saved["heading"]!=heading or saved["sectionSha256"]!=digest or
            saved["bytes"]!=len(text.encode("utf-8")) or
            not 60<=len(text)<=16_000):
            raise ValueError("science_section_hash_or_structure_mismatch")
        sections.append({"sectionId":section_id,"type":typ,"heading":heading,
          "text":text,"sha256":digest})
    if len(sections)!=len(source_item["sections"]):
        raise ValueError("science_sections_not_exact")
    canonical="\n\n".join(s["sectionId"]+"\n"+s["heading"]+"\n"+s["text"] for s in sections)
    if science.digest(canonical)!=source_item["canonicalSectionsSha256"]:
        raise ValueError("source_canonical_sha_mismatch")
    # No captions, SI, reference sections, figure bytes, administrative text.
    return sections,science.digest(canonical)

def published_member(expected_revision):
    release=safe_json(RELEASE)
    gen=str(release.get("architectureCatalogId") or "")
    members=release.get("dois") or []
    if not re.fullmatch("[a-f0-9]{64}",gen) or (
        not isinstance(members,list) or release.get("productionCards")!=len(members) or
        DOI not in members or members.count(DOI)!=1
    ):
        raise ValueError("formal_generation_or_doi_membership_invalid")
    query=urllib.parse.urlencode({"catalogId":gen,"query":DOI,"sort":"oldest","limit":"20"})
    view=safe_json(API+"/api/literature/catalog-view?"+query)
    items=view.get("items") or []
    if (view.get("catalogId")!=gen or view.get("readPathActive") is not True or
        view.get("matched")!=1 or len(items)!=1 or items[0].get("doi")!=DOI or
        items[0].get("revision")!=expected_revision):
        raise ValueError("formal_live_paper_revision_changed")
    return gen,expected_revision,release["productionCards"]

def build_packet(catalog_id,revision,sections,canonical_sha):
    reviewed_at=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
    return {
      "schemaVersion":"reviewed-public-body-section-v1",
      "catalogId":catalog_id,"doi":DOI,"revision":revision,
      "origin":"independently_reviewed_public_text",
      "publicUploadAllowed":True,"sourceSha256":canonical_sha,
      "sections":sections,"completeness":"partial",
      "rightsReview":{
        "decision":"approved_public_reuse","itemLicenseVerified":True,
        "pageDoi":DOI,"sourceSha256":canonical_sha,
        "sourceKind":"publisher_article_license","licenseKind":"cc-by-4.0",
        "licenseUrl":LICENSE,"articleUrl":PUBLISHER,
        "reviewer":"Gallery two-pass chemistry editorial and rights audit",
        "reviewedAt":reviewed_at,
        "reviewNote":"Publisher DOI bound article CC BY 4.0 independently checked; two-pass main article science and mechanism evidence challenged and recorded on 2026-10-14. This import contains independently SHA-verified scientific prose only, omits all images, captions, PDF, SI and reference sections; completeness explicitly partial."
      }
    }

def live_coverage(catalog_id,secret):
    body=safe_json(API+"/api/admin/literature-body-sections/coverage?"+
                   urllib.parse.urlencode({"catalogId":catalog_id}),bearer=secret)
    if body.get("catalogId")!=catalog_id or not isinstance(body.get("verifiedDoi"),int) or (
        not isinstance(body.get("verifiedSections"),int)
    ):
        raise ValueError("production_fts_coverage_invalid")
    return body

def execute(mode,output):
    if mode not in ("preflight","import"):
        raise ValueError("invalid_mode")
    source,ledger=source_record()
    xml=safe_request(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/"+PMCID+"/fullTextXML",
      max_bytes=science.MAX_XML_BYTES,accept="application/xml")
    sections,canonical_sha=extract_exact_sections(xml,source)
    catalog_id,revision,total=published_member(ledger["revision"])
    receipt={"schemaVersion":1,"mode":mode,"checkedAt":datetime.now(timezone.utc).isoformat(),
      "doi":DOI,"catalogId":catalog_id,"revision":revision,"formalDois":total,
      "licenseKind":"cc-by-4.0","licenceVerifiedPublisher":True,
      "sourceXmlSha256":science.sha_bytes(xml),"canonicalScienceSha256":canonical_sha,
      "scientificSections":len(sections),"onlyMainScientificText":True,
      "scienceReview":"two_pass_main_article_only","independentAssetCredits":"pending",
      "SIStatus":"not_reviewed","completeness":"partial",
      "sourceTextPersistedInCI":False,"pdfDownloads":0,
      "publicFtsSearchEnabled":False,"databaseWrites":0}
    if mode=="import":
        secret=os.environ.get("BRIDGE_WRITE_TOKEN","")
        if not secret:
            raise ValueError("owner_write_token_missing")
        before=live_coverage(catalog_id,secret)
        packet=build_packet(catalog_id,revision,sections,canonical_sha)
        response=safe_json_post(API+"/api/admin/literature-body-sections/import",packet,secret)
        if response.get("ok") is not True or response.get("doi")!=DOI or (
            response.get("publicEnabled") is not False
        ):
            raise ValueError("reviewed_science_import_not_acknowledged")
        after=live_coverage(catalog_id,secret)
        if after["verifiedDoi"] < before["verifiedDoi"] or (
            after["verifiedSections"] < before["verifiedSections"] or
            after["verifiedSections"] < len(sections)
        ):
            raise ValueError("reviewed_science_live_readback_failed")
        receipt.update(databaseWrites=0 if response.get("alreadyReviewed") else len(sections),
          alreadyReviewed=bool(response.get("alreadyReviewed")),
          liveVerifiedDois=after["verifiedDoi"],
          liveVerifiedSections=after["verifiedSections"],
          publicFtsSearchEnabled=after.get("publicEnabled") is True)
        if receipt["publicFtsSearchEnabled"]:
            raise ValueError("unexpected_public_fts_switch")
    output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("REVIEWED_SCIENCE_FTS "+json.dumps(receipt,ensure_ascii=False))

def safe_json_post(url,packet,secret):
    data=json.dumps(packet,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    if len(data)>250_000:
        raise ValueError("reviewed_science_post_budget_exceeded")
    raw=safe_request(url,method="POST",payload=data,bearer=secret,max_bytes=100_000)
    try: return json.loads(raw)
    except (UnicodeDecodeError,json.JSONDecodeError):
        raise ValueError("reviewed_science_response_invalid") from None

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--mode",choices=("preflight","import"),required=True)
    p.add_argument("--output",type=pathlib.Path,required=True)
    args=p.parse_args()
    try: execute(args.mode,args.output)
    except Exception as e:
        # Never include source text, credentials, response body, or request URL.
        print("REVIEWED_SCIENCE_FTS_FAILED "+str(e)[:110],file=sys.stderr)
        raise SystemExit(1)
