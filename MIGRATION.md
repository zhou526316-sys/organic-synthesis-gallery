# Migration from AppDeploy

Production baseline: AppDeploy v93 / snapshot `1789534487433`.

## Target architecture

- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- Media objects: Cloudflare R2
- Metadata/state: Cloudflare D1 and/or KV
- Scheduled repair: Cloudflare Cron Triggers
- Restricted publisher retrieval: existing VPN userscript bridge

## Current migration status

- Repository initialized.
- Production README, package config, HTML entrypoint, Tailwind/PostCSS/TypeScript/Vite configs imported.
- Production cron schedule recorded.
- User-shell source and gallery stylesheet imported.
- Remaining production files still to import before refactoring: `src/main.ts`, `backend/index.ts`, `public/gallery-vpn-bridge.user.js`, static literature datasets, and test specification.

## Cutover rule

Do not change the public production URL until the Cloudflare staging deployment matches the AppDeploy v93 behavior for search, multi-journal filtering, language switching, DOI resolution, TOC/Figure rendering, original-article links, and VPN media repair.

## Safety

Never commit API keys, account credentials, session cookies, or publisher/VPN secrets.
