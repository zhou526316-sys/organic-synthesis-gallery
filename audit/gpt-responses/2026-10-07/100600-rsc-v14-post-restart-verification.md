# Response synchronization

北京时间：2026-10-07 10:06 +08:00
上下文：用户已更新并重新启动 Bridge 2.2.58 / install 6.2.39 / RSC v14 后的即时验收。

## Diagnostic snapshot

```json
{
  "targets": {
    "10.1039/d6sc06421c": [
      {
        "updatedAt": 1791301771798,
        "finishedAt": "2026-10-06T15:43:59.804Z",
        "status": "partial",
        "reason": "combined_capture;toc=already_available;figures=0/0;evidence=stored;published=0;pdf=private_pdf_http_403",
        "installRevision": "6.2.37",
        "publisherMediaRevision": "20261006-rsc-preview-reject-v12",
        "controllerRevision": "2.2.41",
        "tocStatus": "already_available",
        "figuresDiscovered": 0,
        "figuresStored": 0,
        "privatePdfStatus": "failed",
        "privatePdfBytes": 0,
        "trace": [
          {
            "seq": 88,
            "stage": "private_pdf_fetch",
            "event": "response",
            "status": "http_error",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/sc/article-pdf/doi/10.1039/D6SC06421C/14817948/d6sc06421c.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;contentType=text/html; charset=UTF-8;durationMs=441"
          },
          {
            "seq": 89,
            "stage": "private_pdf_fetch",
            "event": "failed",
            "status": "failed",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/sc/article-pdf/doi/10.1039/D6SC06421C/14817948/d6sc06421c.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;private_pdf_http_403"
          },
          {
            "seq": 61,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 65,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 69,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 73,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 77,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 81,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 84,
            "stage": "paired_result",
            "event": "complete",
            "status": "success",
            "httpStatus": 0,
            "url": "",
            "message": "combined_capture;toc=already_available;figures=0/0;evidence=stored;published=0"
          },
          {
            "seq": 86,
            "stage": "private_pdf_discovery",
            "event": "complete",
            "status": "found",
            "httpStatus": 0,
            "url": "",
            "message": "explicit_candidates=1;waitedMs=10"
          },
          {
            "seq": 87,
            "stage": "private_pdf_fetch",
            "event": "browser_failed",
            "status": "fallback",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/sc/article-pdf/doi/10.1039/D6SC06421C/14817948/d6sc06421c.pdf",
            "message": "transport=browser_session;Failed to fetch"
          }
        ]
      },
      {
        "updatedAt": 1791276339515,
        "finishedAt": "2026-10-06T08:44:47.333Z",
        "status": "partial",
        "reason": "combined_capture;toc=already_available;figures=0/0;evidence=stored;published=0;pdf=private_pdf_redirect_host_mismatch",
        "installRevision": "6.2.36",
        "publisherMediaRevision": "20261005-rsc-elsevier-ccs-v11",
        "controllerRevision": "2.2.41",
        "tocStatus": "already_available",
        "figuresDiscovered": 0,
        "figuresStored": 0,
        "privatePdfStatus": "failed",
        "privatePdfBytes": 0,
        "trace": [
          {
            "seq": 47,
            "stage": "private_pdf_fetch",
            "event": "failed",
            "status": "failed",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/sc/article-pdf/doi/10.1039/D6SC06421C/14817948/d6sc06421c.pdf",
            "message": "label=;cause=inspect_stage_evidence;transport=gm;private_pdf_redirect_host_mismatch"
          },
          {
            "seq": 17,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 19,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 21,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 23,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 25,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 27,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 29,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 31,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 33,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 35,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 37,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 39,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 42,
            "stage": "paired_result",
            "event": "complete",
            "status": "success",
            "httpStatus": 0,
            "url": "",
            "message": "combined_capture;toc=already_available;figures=0/0;evidence=stored;published=0"
          },
          {
            "seq": 44,
            "stage": "private_pdf_discovery",
            "event": "complete",
            "status": "found",
            "httpStatus": 0,
            "url": "",
            "message": "explicit_candidates=1;waitedMs=6"
          },
          {
            "seq": 45,
            "stage": "private_pdf_fetch",
            "event": "browser_failed",
            "status": "fallback",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/sc/article-pdf/doi/10.1039/D6SC06421C/14817948/d6sc06421c.pdf",
            "message": "transport=browser_session;Failed to fetch"
          },
          {
            "seq": 46,
            "stage": "private_pdf_fetch",
            "event": "response",
            "status": "ok",
            "httpStatus": 200,
            "url": "https://rscj.silverchair-cdn.com/rscj/content_public/journal/sc/jam/10.1039_d6sc06421c/1/d6sc06421c.pdf",
            "message": "transport=gm;contentType=application/pdf;durationMs=3555"
          }
        ]
      }
    ],
    "10.1039/d6gc03161g": [
      {
        "updatedAt": 1791336976998,
        "finishedAt": "2026-10-07T01:34:33.811Z",
        "status": "failed",
        "reason": "combined_capture;toc=not_found;figures=0/0;evidence=stored;published=0;pdf=private_pdf_http_403",
        "installRevision": "6.2.38",
        "publisherMediaRevision": "20261007-rsc-issue-pdf-v13",
        "controllerRevision": "2.2.41",
        "tocStatus": "not_found",
        "figuresDiscovered": 0,
        "figuresStored": 0,
        "privatePdfStatus": "failed",
        "privatePdfBytes": 0,
        "trace": [
          {
            "seq": 48,
            "stage": "private_pdf_fetch",
            "event": "response",
            "status": "http_error",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/en/content/articlepdf/2026/gc/d6gc03161g",
            "message": "label=;cause=access_denied_http_403;transport=gm;contentType=text/html; charset=UTF-8;durationMs=1882"
          },
          {
            "seq": 49,
            "stage": "private_pdf_fetch",
            "event": "failed",
            "status": "failed",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/en/content/articlepdf/2026/gc/d6gc03161g",
            "message": "label=;cause=access_denied_http_403;transport=gm;private_pdf_http_403"
          },
          {
            "seq": 51,
            "stage": "private_pdf_fetch",
            "event": "response",
            "status": "http_error",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;contentType=text/html; charset=UTF-8;durationMs=437"
          },
          {
            "seq": 52,
            "stage": "private_pdf_fetch",
            "event": "failed",
            "status": "failed",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;private_pdf_http_403"
          },
          {
            "seq": 21,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 25,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 29,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 33,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 34,
            "stage": "iframe_dom_scan",
            "event": "load_start",
            "status": "start",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlelanding/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 35,
            "stage": "iframe_dom_scan",
            "event": "complete",
            "status": "none",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlelanding/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 36,
            "stage": "iframe_dom_scan",
            "event": "load_start",
            "status": "start",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 37,
            "stage": "iframe_dom_scan",
            "event": "complete",
            "status": "none",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 41,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 44,
            "stage": "paired_result",
            "event": "complete",
            "status": "failed",
            "httpStatus": 0,
            "url": "",
            "message": "combined_capture;toc=not_found;figures=0/0;evidence=stored;published=0"
          },
          {
            "seq": 46,
            "stage": "private_pdf_discovery",
            "event": "complete",
            "status": "found",
            "httpStatus": 0,
            "url": "",
            "message": "explicit_candidates=2;waitedMs=6"
          },
          {
            "seq": 47,
            "stage": "private_pdf_fetch",
            "event": "browser_failed",
            "status": "fallback",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlepdf/2026/gc/d6gc03161g",
            "message": "transport=browser_session;Failed to fetch"
          },
          {
            "seq": 50,
            "stage": "private_pdf_fetch",
            "event": "browser_failed",
            "status": "fallback",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "transport=browser_session;Failed to fetch"
          }
        ]
      },
      {
        "updatedAt": 1791301351801,
        "finishedAt": "2026-10-06T15:41:38.798Z",
        "status": "failed",
        "reason": "combined_capture;toc=not_found;figures=0/0;evidence=stored;published=0;pdf=private_pdf_http_403",
        "installRevision": "6.2.37",
        "publisherMediaRevision": "20261006-rsc-preview-reject-v12",
        "controllerRevision": "2.2.41",
        "tocStatus": "not_found",
        "figuresDiscovered": 0,
        "figuresStored": 0,
        "privatePdfStatus": "failed",
        "privatePdfBytes": 0,
        "trace": [
          {
            "seq": 52,
            "stage": "private_pdf_fetch",
            "event": "response",
            "status": "http_error",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;contentType=text/html; charset=UTF-8;durationMs=1522"
          },
          {
            "seq": 53,
            "stage": "private_pdf_fetch",
            "event": "failed",
            "status": "failed",
            "httpStatus": 403,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "label=;cause=access_denied_http_403;transport=gm;private_pdf_http_403"
          },
          {
            "seq": 25,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 29,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 33,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 37,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 38,
            "stage": "iframe_dom_scan",
            "event": "load_start",
            "status": "start",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlelanding/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 39,
            "stage": "iframe_dom_scan",
            "event": "complete",
            "status": "none",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlelanding/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 40,
            "stage": "iframe_dom_scan",
            "event": "load_start",
            "status": "start",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 41,
            "stage": "iframe_dom_scan",
            "event": "complete",
            "status": "none",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/en/content/articlehtml/2026/gc/d6gc03161g",
            "message": ""
          },
          {
            "seq": 45,
            "stage": "figure_discovery",
            "event": "scan_complete",
            "status": "none",
            "httpStatus": 0,
            "url": "",
            "message": "isolated_labels=0;variants=0"
          },
          {
            "seq": 48,
            "stage": "paired_result",
            "event": "complete",
            "status": "failed",
            "httpStatus": 0,
            "url": "",
            "message": "combined_capture;toc=not_found;figures=0/0;evidence=stored;published=0"
          },
          {
            "seq": 50,
            "stage": "private_pdf_discovery",
            "event": "complete",
            "status": "found",
            "httpStatus": 0,
            "url": "",
            "message": "explicit_candidates=1;waitedMs=5"
          },
          {
            "seq": 51,
            "stage": "private_pdf_fetch",
            "event": "browser_failed",
            "status": "fallback",
            "httpStatus": 0,
            "url": "https://pubs.rsc.org/gc/article-pdf/doi/10.1039/D6GC03161G/14819321/d6gc03161g.pdf",
            "message": "transport=browser_session;Failed to fetch"
          }
        ]
      }
    ]
  },
  "recent": [
    {
      "doi": "10.1021/acs.joc.6c01871",
      "updatedAt": 1791338780929,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=4/6;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01760",
      "updatedAt": 1791338771340,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=1/8;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01570",
      "updatedAt": 1791338761055,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=7/8;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01554",
      "updatedAt": 1791338752190,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=5/8;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01409",
      "updatedAt": 1791338740862,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=6/6;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01736",
      "updatedAt": 1791338310390,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=5/9;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01609",
      "updatedAt": 1791338131308,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=6/6;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/acs.joc.6c01504",
      "updatedAt": 1791337950204,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=5/6;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/jacs.6c13337",
      "updatedAt": 1791337232603,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=2/5;evidence=stored;published=0"
    },
    {
      "doi": "10.1021/jacs.6c11144",
      "updatedAt": 1791337152730,
      "status": "success",
      "reason": "combined_capture;toc=stored;figures=0/7;evidence=stored;published=0"
    }
  ],
  "queue": [
    {
      "position": 6,
      "doi": "10.1039/d6sc06421c",
      "status": "missing",
      "tocMissing": true,
      "figureCount": 0,
      "lastRootCause": "rsc_v13_priority_retry",
      "lastOutcome": "missing",
      "nextRetryAt": 0,
      "reportedPriority": true
    },
    {
      "position": 10,
      "doi": "10.1039/d6gc03161g",
      "status": "missing",
      "tocMissing": true,
      "figureCount": 0,
      "lastRootCause": "rsc_v13_priority_retry",
      "lastOutcome": "missing",
      "nextRetryAt": 0,
      "reportedPriority": true
    }
  ]
}
```
