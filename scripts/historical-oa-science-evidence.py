#!/usr/bin/env python3
"""Bounded authentic Europe PMC JATS scientific chapter review evidence.

Only CC BY 3/4 DOI-matched public OA articles already recorded in the
authoritative source review worklist are examined. Raw XML and all scientific
prose remain in memory; only deterministic section SHA/length/heading evidence
is retained. Not an authorization to publish public FTS full text.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

DOI = re.compile(r"^10\.\d{4,9}/[^\s?#]{1,220}$")
PMCID = re.compile(r"^PMC\d{4,12}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
LICENSE = re.compile(r"https?://creativecommons\.org/licenses/by/(3\.0|4\.0)/?", re.I)
RESTRICTED = re.compile(r"licenses/by-(?:nc|nd)|noncommercial|no.derivatives|all rights reserved", re.I)
TYPES = {"introduction", "results", "scope", "mechanism", "experimental", "conclusion", "other", "figure_caption", "table"}
MAX_XML_BYTES = 2_800_000
MAX_SCIENCE_BYTES = 240_000
MAX_EVIDENCE_UNITS = 64
MAX_SECTION_CHARS = 16_000

def lname(tag):
    return str(tag).split("}")[-1].lower()

def norm(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()

def element_text(node):
    return norm(" ".join(node.itertext())) if node is not None else ""

def digest(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()

def kind(heading):
    h = heading.lower()
    if "mechanis" in h or "kinetic" in h or "control experiment" in h:
        return "mechanism"
    if "result" in h or "discussion" in h or "synthetic" in h:
        return "results"
    if "substrate" in h or "scope" in h:
        return "scope"
    if "methods" in h or "experimental" in h or "procedure" in h:
        return "experimental"
    if "conclusion" in h or "outlook" in h or "summary" in h:
        return "conclusion"
    if "introduc" in h or "background" in h:
        return "introduction"
    return "other"

def direct_science_paragraphs(element):
    """Paragraphs inside a section, excluding nested scientific sections/media."""
    result = []
    skip = {"sec", "fig", "table-wrap", "supplementary-material", "ref-list",
            "permissions", "ack", "fn-group", "app-group"}
    def walk(node):
        for child in node:
            t = lname(child.tag)
            if t in skip:
                continue
            if t == "p":
                value = element_text(child)
                if value:
                    result.append(value)
            else:
                walk(child)
    walk(element)
    return result

def find_direct_child(parent, name):
    return next((c for c in parent if lname(c.tag) == name), None)

def parse_science_jats(xml_bytes, expected_doi, expected_xml_sha=None):
    """Returns *hash-only* scientific evidence. No article body in output."""
    if not DOI.match(expected_doi) or len(xml_bytes) < 500 or len(xml_bytes) > MAX_XML_BYTES:
        raise ValueError("invalid_doi_or_source_size")
    actual_xml_sha = sha_bytes(xml_bytes)
    if expected_xml_sha is not None and expected_xml_sha != actual_xml_sha:
        raise ValueError("source_xml_sha_changed")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        raise ValueError("source_xml_parse_failed") from None
    meta = next((e for e in root.iter() if lname(e.tag) == "article-meta"), None)
    if meta is None:
        raise ValueError("article_meta_missing")
    dois = {
        element_text(e).lower().removeprefix("https://doi.org/")
        for e in meta.iter()
        if lname(e.tag) == "article-id" and e.attrib.get("pub-id-type") == "doi"
    }
    if dois != {expected_doi}:
        raise ValueError("article_doi_identity_mismatch")
    permissions = [e for e in meta.iter() if lname(e.tag) == "license"]
    if not permissions:
        raise ValueError("article_license_missing")
    license_xml = " ".join(ET.tostring(e, encoding="unicode") for e in permissions)
    if RESTRICTED.search(license_xml):
        raise ValueError("article_license_restricted")
    matches = set(LICENSE.findall(license_xml))
    if len(matches) != 1:
        raise ValueError("article_license_not_exact_cc_by")
    license_kind = "cc-by-" + next(iter(matches))
    body = next((e for e in root.iter() if lname(e.tag) == "body"), None)
    if body is None:
        raise ValueError("science_body_missing")
    units, short_fragments, headings, paragraphs = [], [], [], 0
    # Publication-side administrative statements are not scientific evidence.
    ADMIN_HEADINGS = ("data availability", "code availability", "rights and permissions",
        "additional information", "ethics declarations", "author information",
        "acknowledgements", "acknowledgments", "funding information",
        "conflict of interest", "competing interests", "supplementary information",
        "supplementary material", "online content", "author contributions",
        "contributor information", "funding", "correspondence", "bibliography",
        "conflict of interests", "declaration of competing interest")
    def include_piece(typ, heading, text, n):
        # Keep short *authentic* scientific fragments as a separate hash-
        # evidenced completeness gap. They are never fabricated/padded to pass
        # the 60-char FTS threshold, but also never discard the whole article.
        record=(typ, heading, text, n)
        if len(text) < 60:
            short_fragments.append(record)
        else:
            units.append(record)
    # Top-level paragraphs outside any section are still scientific content.
    top = direct_science_paragraphs(body)
    if top:
        headings.append(("Introduction / unheaded main text", "introduction", top))
    for sec in body.iter():
        if lname(sec.tag) != "sec":
            continue
        title = find_direct_child(sec, "title")
        h = element_text(title) or "Untitled main article section"
        if h.lower().startswith(ADMIN_HEADINGS):
            continue
        texts = direct_science_paragraphs(sec)
        if texts:
            headings.append((h, kind(h), texts))
    for heading, typ, ps in headings:
        paragraphs += len(ps)
        current = []
        for p in ps:
            if len(p) > MAX_SECTION_CHARS:
                raise ValueError("one_science_paragraph_too_large")
            trial = norm(" ".join([*current, p]))
            if len(trial) > MAX_SECTION_CHARS and current:
                include_piece(typ, heading, norm(" ".join(current)), len(current))
                current = [p]
            else:
                current.append(p)
        if current:
            include_piece(typ, heading, norm(" ".join(current)), len(current))
    # Caption evidence is counted but not imported or mixed with scientific
    # prose until image/third-party credit review has separately passed.
    captions = []
    for tag in ("fig", "table-wrap"):
        for node in body.iter():
            if lname(node.tag) != tag:
                continue
            c = find_direct_child(node, "caption")
            caption = element_text(c)
            if caption:
                captions.append({"sourceType": tag, "sourceId": node.attrib.get("id") or None,
                    "chars": len(caption), "sha256": digest(caption),
                    "mediaCreditReview": "pending_separate_asset_review"})
    # A short segment is scientific evidence, but not an eligible standalone
    # 60-character FTS row. Preserve its hash and explicitly downgrade
    # completeness until a future human-reviewed merge preserves the source.
    all_units = units + short_fragments
    scientific_chars = sum(len(text) for _,_,text,_ in all_units)
    if not all_units or paragraphs < 2 or scientific_chars < 450:
        raise ValueError("science_content_missing_or_abstract_only")
    science_classified = any(
        t in {"results", "scope", "mechanism", "experimental"} for t,_,_,_ in all_units
    )
    if len(all_units) + len(captions) > MAX_EVIDENCE_UNITS:
        raise ValueError("science_unit_capacity_exceeded")
    total_bytes = sum(len(s.encode("utf-8")) for _,_,s,_ in all_units)
    if total_bytes > MAX_SCIENCE_BYTES:
        raise ValueError("science_byte_budget_exceeded")
    manifest_units = []
    for i, (typ, heading, text, n) in enumerate(units, 1):
        manifest_units.append({"sectionId":f"s{i:03d}", "type":typ,
            "heading":heading[:200], "paragraphs":n,
            "chars":len(text),"bytes":len(text.encode("utf-8")),
            "sectionSha256":digest(text)})
    short_manifest = [
        {"type":typ,"heading":heading[:200],"paragraphs":n,
         "chars":len(text),"sha256":digest(text),
         "reviewStatus":"source_short_fragment_pending_safe_merge"}
        for typ,heading,text,n in short_fragments
    ]
    canonical = "\n\n".join(
        f"s{i:03d}\n{heading[:200]}\n{text}" for i,(_, heading,text,_) in enumerate(units,1)
    )
    kinds = Counter(t for t,_,_,_ in all_units)
    complete = science_classified and kinds["results"]>0 and kinds["conclusion"]>0 and len(units)>=3 and not short_fragments
    return {
        "state":"science_sections_mapped_pending_independent_review" if units else "science_fragments_only_pending_review",
        "source":"Europe PMC official CC BY JATS","doi":expected_doi,
        "xmlSha256":actual_xml_sha,"licenseKindSignal":license_kind,
        "scienceSectionUnits":len(units),"scientificParagraphs":paragraphs,
        "shortScienceFragmentCount":len(short_fragments),
        "scienceClassificationEvidence":"recognized_science_heading" if science_classified else "unclassified_maintext_pending_review",
        "scienceCharacters":sum(len(s) for _,_,s,_ in all_units),
        "scienceTextBytes":total_bytes,"captionEvidenceCount":len(captions),
        "completenessCandidate":"complete_candidate" if complete else "partial",
        "canonicalSectionsSha256":digest(canonical),
        "sections":manifest_units,"shortScienceFragments":short_manifest,"captions":captions,
        "canonicalIndexScope":"index_candidate_only_pending_short_fragment_merges" if short_fragments else "all_parsed_science_units",
        "publicFtsImported":False,"publicUploadAllowed":False,"originalXmlPersisted":False,
        "articleTextPersisted":False,"siOrPdfDownloaded":False
    }

def fetch_one(pmcid, timeout=16):
    if not PMCID.match(pmcid):
        raise ValueError("pmcid_invalid")
    url=f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
    request=urllib.request.Request(url, headers={
        "Accept":"application/xml","User-Agent":"OrganicSynthesisGallery-science-review/1.0"})
    opener=urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    with opener.open(request,timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("source_http_"+str(response.status))
        raw=response.read(MAX_XML_BYTES+1)
    if len(raw)>MAX_XML_BYTES:
        raise ValueError("source_too_large")
    return raw

def run(worklist_path, offset, count, output):
    data=json.loads(Path(worklist_path).read_text(encoding="utf-8"))
    if data.get("oaCandidateDois") != len(data.get("articles",[])):
        raise ValueError("worklist_length_mismatch")
    papers=data["articles"]
    if offset<0 or count<1 or offset>=len(papers) or offset+count>len(papers):
        raise ValueError("window_invalid")
    report={"schemaVersion":1,"readOnly":True,"worklistSourceCatalogId":data["catalogId"],
        "sourceWorklist":str(worklist_path),"formalDois":data["formalDois"],
        "totalOaCandidates":len(papers),"offset":offset,"count":count,
        "xmlOriginalsPersisted":0,"publicFtsImports":0,"entries":[]}
    paused=False
    for row in papers[offset:offset+count]:
        doi=row.get("doi","")
        output_row={"doi":doi,"journal":row.get("journal"),"state":"unknown"}
        if paused:
            output_row["state"]="provider_paused"
        else:
            try:
                if row.get("sourceLicenseSignal") not in ("by/3.0","by/4.0"):
                    raise ValueError("source_license_signal_not_cc_by")
                evidence=parse_science_jats(fetch_one(row["pmcid"]),doi,row["xmlSha256"])
                output_row.update(evidence)
            except urllib.error.HTTPError as e:
                output_row["state"]="source_http_"+str(e.code)
                if e.code==429:
                    paused=True
            except (urllib.error.URLError,TimeoutError):
                output_row["state"]="source_unavailable"
            except ValueError as e:
                output_row["state"]=str(e)
            except Exception:
                output_row["state"]="source_unavailable"
            time.sleep(0.5)
        report["entries"].append(output_row)
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("OA_SCIENCE_SECTION_EVIDENCE "+json.dumps({
        "offset":offset,"count":count,
        "states":dict(Counter(v["state"] for v in report["entries"])),
        "scienceSections":sum(v.get("scienceSectionUnits",0) for v in report["entries"]),
        "originalXmlStored":0,"publicFtsImported":0},ensure_ascii=False))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--worklist",default="audit/body-source-review/2026-10-14-all-formal-oa-review-worklist.json")
    ap.add_argument("--offset",type=int,required=True)
    ap.add_argument("--count",type=int,required=True)
    ap.add_argument("--output",required=True)
    x=ap.parse_args()
    run(Path(x.worklist),x.offset,x.count,Path(x.output))

if __name__=="__main__":
    try: main()
    except (ValueError, OSError) as ex:
        print("OA_SCIENCE_SECTION_EVIDENCE_FAILED "+str(ex)[:150],file=sys.stderr)
        raise SystemExit(1)
