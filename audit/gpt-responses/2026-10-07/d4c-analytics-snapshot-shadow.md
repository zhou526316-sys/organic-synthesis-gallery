Beijing time: 2026-10-07
Context: D4c analytics public snapshot shadow
Installed singleton analytics snapshot schema and Worker shadow path. Heavy analytics aggregation is moved to an authorized/background refresh with pageview/materialized and paper-open source-race fencing. Production cron becomes 15-minute snapshot refresh while existing media/handoff maintenance remains six-hour gated. Snapshot public read remains disabled; /site-stats is unchanged pending D4d cutover.
