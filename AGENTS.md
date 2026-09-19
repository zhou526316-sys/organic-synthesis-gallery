# Project-wide execution rules

This file is the canonical working agreement for all chats, coding agents, and maintenance sessions touching this repository.

## Default testing and deployment workflow

1. Do not use TinyFish as the default way to debug or regression-test this site.
2. For backend/user-account problems, first test the production or preview API directly and inspect HTTP status, JSON payloads, CORS, authentication/session behavior, and logs.
3. For frontend interaction problems, use Playwright in GitHub Actions or another deterministic browser test runner. Tests should capture:
   - browser console errors
   - uncaught JavaScript errors
   - failed network requests
   - request/response status for relevant API calls
   - screenshots or traces on failure
4. GitHub Pages frontend flow:
   - build/test
   - Playwright smoke/regression checks
   - deploy to GitHub Pages
5. Cloudflare Worker/API flow:
   - API tests
   - dry-run/bundle validation
   - deploy Worker
   - production smoke tests
6. Use Browserbase for journal-site automation, authenticated browsing, VPN/proxy-dependent access, PDF retrieval, TOC/figure scraping, and persistent browser sessions.
7. Use TinyFish only as an optional fallback for ad-hoc visual inspection when deterministic tooling is unavailable or the task is genuinely browser-agent oriented. It is not the primary test system.
8. Do not use ChatGPT Work/Cloud Browser as the main automated regression system; use it only for occasional manual-style inspection.
9. For user registration/login regressions, add or update automated tests rather than repeatedly relying on manual clicking.
10. Preserve concurrent changes from other project chats. Re-fetch current files/SHAs before writes and make targeted edits.

## Current architecture preference

Frontend: GitHub Pages  
Frontend regression testing: Playwright  
Backend/API: Cloudflare Worker + D1  
Backend regression testing: direct HTTP/API tests + GitHub Actions smoke jobs  
Journal/PDF/TOC automation: Browserbase + user-accessible network/VPN environment

Treat this file as the default project-wide rule unless the user explicitly overrides it in a later message.
