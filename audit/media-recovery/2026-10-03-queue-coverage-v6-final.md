# Queue coverage v6 final candidate

This supplements audit/media-recovery/2026-10-03-queue-coverage-v6.md. The earlier diagnosis and deployment limitations remain valid.

Final ordering is strictly website addedDate descending, then Nature/Science/Nature subjournals/Science subjournals/JACS/Angew/Chem/other. First-visit preference over a continuation applies only within the SAME date and journal priority. It does not move a historical first visit ahead of a newer continuation or Chem ahead of Nature in the same date. The scheduler can still process another ready task while the higher-priority task observes a necessary delay. This corrects the preliminary document's overly broad first-pass-fairness description.

Three dedicated regressions assert newest continuation before older Nature, same-day Nature continuation before Chem, and unvisited before retry within identical priority. Final branch run37040876515/job110950391990 succeeded. Artifact11241812430 was downloaded and opened:160 relevant unit/priority checks passed, both Chromium fixtures passed, source and installer matched the independently checked local bytes. The61-paper fixture still has one run ID,60confirmed complete and1blocked, not0remaining; missing-only765->3fixture still passes. Browser tests use mocked extension storage/publisher network, not the user's installed Tampermonkey or VPN.

Final public/toc-mainline.user.js Git blob af50b8320845d819dad75d86c5c3a97caf52271b,236182bytes,SHA256fdf0f004872afd2f6cc6f64edff7849c37c01b510141d360efd591188c93d7f4.
Final generated installer281274bytes,SHA256621c82fbe4170d6dd33b5b3f1c2689b600a4d3daf607f7b3fb52bda0cda33425.
Panel 全队列补缺6; button 立即开始任务（只补缺项）; controller2.2.39/protocol6.2.20/generation1790082000000 unchanged.

No fixed40-paper cap, no all-corpus redownload, no deletion of credentials or positive media receipts, no literature/scheduled-task/publication-policy changes. Partial and blocked obligations remain counted after their attempts, recoverable partial work continues, and unreadable inventory does not silently delete previously known pending work. Unavailable private inventory and publisher access restrictions remain explicit limitations; no claim that every unknown/inaccessible paper can currently be captured.

The proposed separate cross-refresh metadata hold patch was not transmitted after its tool rejection and is not part of this candidate. The five local tests for that uncommitted refinement are excluded from the160 count above. Existing historical workflow failures are not relabelled green. Actual canonical deployed installer bytes must match the final hash above before sharing a new online update link. User-desktop adoption and successful real publisher recapture remain unverified.
