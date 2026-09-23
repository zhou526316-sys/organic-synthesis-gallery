# Sealed-media recovery batch two: independent prepublication verification

Context: continue the interrupted request to track automatic capture failures and reuse archived TOC/main visuals. Beijing verification window 2026-09-23 11:09–11:20. This file is prepublication evidence; no claim of deployment is made here.

## Scope and retained work

Main read at start: ed7c0f0bf12a203a2a4f72b7ec06efd2eb1c37cf. Interrupted recovery branch found: fix/sealed-media-recovery-batch2. Tested functional head 4a891e0d35638b1a45d5e5f0889bf7e5f2990af8; subsequent head 4a36092a0b67f04b7d93f5d30490e9d8dccdda0e adds the live-file checker. PR #146 opened in this continuation. Existing Tampermonkey 2.2.22 and its protocol, scheduler, data intake and quarantine are not changed. Unrelated open capture-release PRs are not merged.

The proposed recovery contains 20 exact files: 17 Angew official TOCs, 1 Nature Synthesis official TOC (10.1038/s44160-026-01158-6), and two explicitly identified Figure 1 fallback visuals (10.1038/s41467-026-76235-7 and 10.1021/acscatal.6c04593). No Figure 1 is reclassified as an official TOC. The old 21:00 quarantine and original media timestamps are preserved.

## Independent evidence checks in this continuation

Downloaded evidence artifact 10730400413 via GitHub connector to the active runtime. Recomputed archive SHA256: edb744283dec586e5a738e399fdee19ebf9e6913887bb7bf36a9422f0f8621b1, matching the frozen input.
For all 17 approved Wiley records, independently recomputed full image hashes, matched stored content-hash prefixes, parsed the JPEG bytes, and checked exact pre-incident immutable report evidence: matching task/article/source identity, v6.2.0–6.2.15 job start, page doiMatch=true, graphical-abstract candidate identification, upload-start bytes, and completed receipt for the exact stored R2 key and byte length. All 17 passed. This is not independent publisher-origin re-fetching; it is preserved provenance plus byte verification.
Viewed all three supplied six-image contact sheets and compared the 17 selected graphical abstracts with their current literature titles. Held anie.5617321: its graphic contains optimization/ligand-screening material and is not approved as an official TOC. The 19 ACS issue-page aliases still lack sufficient independent page-identity evidence and remain outside this allowlist.
For the three non-Wiley objects, re-read frozen artifact 10699805219, recomputed full SHA256 and inspected image-063 (Nature Communications Figure 1), image-064 (ACS Catalysis Figure 1, SVG rendered for inspection) and image-092 (Nature Synthesis graphical abstract). Image roles and the visible chemistry align with the current titles; source paths encode their exact DOI and Figure 1/Figa role. No image manipulation or upscaling is used for restored asset bytes.

Workbench 35812689230, job 107027500097: success. 16 new recovery checks plus 12 existing TOC checks passed. Dry run: 20 eligible (18 official, 2 Figure 1), first 83 recovered TOCs retained, corpus input bytes unchanged; 103 records/105 image references/0 static integrity failures. The second run is idempotent. PR checks and live-file acceptance remain required before publication success.

## Fresh automatic-report tracking

Read trigger commit 484418a884b1eff45980ddcc86b2ffec37074fc1; workflow 35813615607 succeeded. Downloaded artifact 10729973894 and independently matched its ZIP SHA256 61a8b4285eb172c2429bf0f911b849fc67667e3b6b9bab5de21dc053ed8cb56b.
Actual R2 read started 11:15:40.074119 and completed 11:15:44.167100 Beijing. 128 DOI in report index; 44 have a latest automatic report (versus 11 at the prior 10:36 read). These are DOI report states, not 44 successful papers or a completed batch. No top-level or detailed-object read errors. Latest reports explicitly retain controllerRevision 2.2.22 in diagnostic context; latest stored timestamp in the snapshot is 11:15:20.194.
Latest Wiley reports for anie.8290035 (11:14:10), anie.3685338 (11:12:49) and anie.5852828 (11:10:29) still say TOC not_found and figures 0/0. Their independently verified old TOCs are included in this recovery allowlist. The 0/0 report is a discovery failure, not proof that the publisher has no images; current access/DOM causes still require investigation.
OL 6c03279 Figure 1 produced another figure_stage HTTP 503 at 11:13:22.862, with final 1/2 stored. This is a failed storage submission, not an image-download 403. Specific backend response detail is still missing in the observed report, so quota, Worker exception and infrastructure causes remain unproven. Other candidate-level ACS 403/transport/content errors must not be equated to final paper failures.
No attempt was made to delete, recapture, reset or repair production media during this report read. No automatic permanent assistant monitoring or code-repair loop is claimed.

## Progress replies

我接着核对第二批封存图片和最新自动报告。先恢复能确认 DOI、图片角色和文件哈希的部分，不解除全库隔离，也不覆盖已有正确 TOC。

第二批已筛出18张官方TOC和2张Figure 1主图，正在做发布前检查。17张Angew TOC都找到了封存前的抓取报告，能对应到具体文章、图片来源和已保存文件。最新自动报告也已读到：截至北京时间11:15，已有44个DOI留下自动报告；正文图保存接口仍出现503，几篇Angew仍报0/0。这批先复用核验通过的旧图，减少无效重抓；这些抓取故障仍未解决。
