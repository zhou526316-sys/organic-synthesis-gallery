# Literature Update / Sync Protocol

This repository uses `audit/literature-update-state.json` as the single coordination source for literature retrieval, TOC collection, and website synchronization.

## Mandatory rule for every ChatGPT window/task

Before any literature-related action, read `audit/literature-update-state.json`.

- `fetching` / `toc_processing` with a fresh lock (<120 min): another run is active. Do not start a second literature or TOC crawl.
- `ready_to_sync` / `sync_failed`: reuse the completed fetch and TOC output. Perform sync/deploy only. Do not query Crossref/OpenAlex/publisher TOC pages again.
- `synced` with matching `dataCommitSha`: do not fetch or redeploy. Only perform lightweight production verification if requested.
- `needs_approval` / `blocked_by_concurrent_change`: do not bypass approval or overwrite concurrent work.
- stale/missing state: do not silently assume a new crawl is required; report the state problem to the primary literature-update workflow.

## Fetch workflow

The primary scheduled literature task owns candidate discovery, LLM review, metadata verification, TOC retrieval, data commits, and first-attempt website synchronization. It must update the state file through `fetching -> toc_processing -> ready_to_sync -> syncing -> synced` (or an explicit failure state).

## Sync-only workflow

A request such as “同步一下网页 / 同步文献到网站” is a sync-only request when a recent completed fetch exists. It must consume the recorded dataset/TOC commits and must not repeat candidate discovery or TOC crawling.

## Concurrency

Every state transition must fetch the current blob SHA and use that SHA for the write. If the SHA changed, stop instead of overwriting. Literature data and TOC updates should use minimal diffs and must not modify unrelated UI/user/account/search/API code.

## Scheduled fallback

The primary task runs at 08:00 and 18:00 Asia/Shanghai. A sync-only fallback runs at 08:30 and 18:30 Asia/Shanghai and is explicitly forbidden from re-fetching literature or TOCs.
