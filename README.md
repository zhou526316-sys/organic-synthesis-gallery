# Organic Synthesis Literature Gallery

This repository is the source-of-truth migration target for the Organic Synthesis Literature Gallery.

## Baseline

- Imported from AppDeploy production snapshot `v93` (`1789534487433`).
- Existing AppDeploy production site remains online during migration.
- The first commit series preserves the production source without behavioral changes.

## Migration plan

1. Preserve the AppDeploy v93 source and static literature data.
2. Replace AppDeploy-specific frontend/backend SDK calls with portable APIs.
3. Move media/object storage to Cloudflare R2 and metadata/state to D1/KV as appropriate.
4. Replace AppDeploy cron jobs with Cloudflare Cron Triggers.
5. Keep the VPN userscript bridge for publisher-restricted media acquisition.
6. Validate the Cloudflare staging site against the current production Gallery before cutover.

Do not store API keys or other secrets in this repository.
