# PDF owner acceptance Console code delivery

Beijing date: 2026-10-10. Chat context: user requested the existing browser Console PDF gateway acceptance code.

The reply includes the audited unchanged JavaScript source from `deploy/pdf-gateway/owner-acceptance-console.js` on the independent gateway branch. Source Git blob SHA: `125811b155b15d372de1961f1258161e01edb5e9`.

Instructions: log into the Gallery website, open Edge DevTools Console with F12, paste the linked reviewed script, enter an already stored DOI, and share only sanitized result statuses. The canary verifies anonymous gateway health, owner authorization, and the first 16 PDF bytes by Range 206. It does not log PDF content or private credentials, and does not enable fallback. Successful result requires HTTP 200 health and authorize, available=true, HTTP 206 file and PDF signature. Never share Network headers or private links.

Source reviewed: https://github.com/zhou526316-sys/organic-synthesis-gallery/blob/feature/owner-private-pdf-dual-ingress-20261008/deploy/pdf-gateway/owner-acceptance-console.js
