# New marked body automatic publication — predeployment record

Beijing context2026-09-23 16:32. User task: continue after31 new body images were manually published; newly captured figures should not wait for repeated historical-forensics review. This record is NOT production acceptance.

Main at start6753417ce42ec81b2eea724ef7c26f79a2c276f0. Reused concurrent read35833001369 instead of launching another stored-media sweep. Downloaded artifact10737978319 to active runtime and recomputed ZIP SHA256d2ca8159ecdabb4ee21aa389f92f621de0c962eec657ba9514e31f584ded782c. Read07:41:11–07:41:26Z:308 total stage rows,297 post-cutover,297 bound rows;77 automatic latest DOI states among132 reports. These are coverage/inventory counts, not successes. The supplied21-file subset contained9 actual revision1-marked current captures from4 DOI. These were used as real-byte test fixtures, not new publisher downloads or synthetic production uploads.

## Implementation in PR160 only at this point

Feature feat/new-body-validated-autopublish. Latest head dc0ebc7180657b6fb63c7b95d497a9379e322eb8. Twelve changed paths: two new media modules, independent verifier extraction from existing manual verifier, policy, documentation amendment, integration/test/live-check scripts and four workflow changes/additions. No Worker intake, client userscript, UI code, source literature data, staged storage objects or old quarantine epoch changed.

The user-authorized fast path is a distinct automatic technical-provenance authority. It does NOT set manual review.decision=approved or misrepresent individual visual/semantic review. Existing manual verifier still demands approved=true. New entries are explicitly automated_provenance_bytes_and_decode, individualSemanticReview=false. Only current server-marked ACS body files are initially admitted. Exact task/page/source DOI, canonical evidence fingerprint, current job/protocol/generation, trusted full-article/CDN paths and article-specific numbered basename, Figure/Scheme identity/caption, actual stored SHA256/bytes/type/dimensions and isolated Chromium decoding are required. Opaque sources, TOC-like roles, old/unmarked captures, conflicting hashes/labels, excluded/scope-held papers and same-id replacement remain outside.

The pipeline reuses previous automatic publication snapshots and actual stored file bytes while the existing manual restoration remains authoritative for its own approved images. Unreadable previous automatic files stop a build before output changes rather than silently disappearing. Unavailable current stage feed preserves previous automatic publication. Individual new-file errors are isolated with bounded retry timing. New admission is capped at5 papers/30 images, and the existing10-thumbnail display limit is respected. No publisher recrawl, R2/D1 mutation, old-time rewriting or complete-inventory claim.

The proposed internal repository schedule checks at UTC minutes7/22/37/52 and only invokes the unchanged literature-authorized Pages workflow when eligible unseen captures exist. This is not a new ChatGPT task and does not replace or change the existing hourly manual exception-review task. Actual scheduled invocation/deployment has NOT been verified yet. GitHub schedule may be delayed;15 minutes is a check interval, not guaranteed publication latency.

## Testing and a caught false-green

Initial workbench35836284681 appeared green, but log inspection caught auto_not_numbered_body_asset before any PR merge. The new ACS basename pattern incorrectly expected two digits before c; real supplied assets are m_ja6cNNNNN_XXXX. Also tee masked the failed test exit. Neither the false-green nor its unrelated passing old tests was treated as automatic-publication acceptance. Corrected the basename to the owning article's exact prefix/suffix and enabled strict pipefail plus required final test-summary detection.

Strict workbench35836932347 SUCCESS:19 NEW tests, including independent metadata/actual byte validation and isolated Chromium decode for all9 real marked files; old/unmarked/foreign source/forged approval/TOC/caption mutation/hash corruption/duplicate identity cases; original TOC preservation; first-time automatic publication with truthful nonsemantic labels; idempotent carry-forward; stage outage; prior-image failure before output mutation; pending scope hold; removed DOI. Existing17 reviewed-body and19 marker tests also ran. Downloaded artifact10739287745; independently rehashed ZIP4c68b64354131334b7172ce36d6f937b57071a0f57b89ce3c9556eb59616ae9d and verified all19 pass lines plus completed NEW_BODY_AUTO_TESTS summary. Tested functional head8c95cacb4f651a398ae4e1eda762f828072a0b7d; later commits only add the production schedule and live acceptance/known-sanitizer timestamp treatment.

Preexisting sanitizer always updates media-index.generatedAt after the automatic merge; live acceptance therefore requires the ledger and auto snapshot to have the exact shared merge time, the final media not to predate that time, and independently matches EVERY auto asset's actual bytes/DOI/id/label/URL/evidence to the final sanitized index and public ledger. It does not weaken identity checks by requiring only counts or assume pipeline timestamps must equal.

PR160 current site-quality35837577491 is still running at this record. Must require all PR checks, deployment, real published file verification, actual card decoding and a continuous-workflow invocation before announcing success. The installed Bridge remains2.2.23; this feature does not claim upload503/MIME/Wiley discovery fixes.

## Progress replies this turn

这批直接推进“新抓正文图校验后增量上架”，不再重复恢复旧图。我先对齐当前主线的打标、待发布队列和发布入口，再补上缺失环节；旧图隔离保持不变。

已确认缺口：服务器已经给新图打标，但目前没有自动发布流程读取这些标记，所以图片仍停在待审状态。

我这批先接通来源最容易核对的ACS新正文图：重新校验实际文件、DOI、图号和证据指纹后增量上架；来源不明、图号冲突或涉及待复核文献的图片继续单独待查。不会把“抓取成功”直接当作发布许可。

新图自动上架的校验流程已完成，19项专项测试通过，其中包括对9张真实新抓图片的文件校验和浏览器解码。当前正在跑发布前检查，尚未上线。

这条流程会定期检查新增记录，校验通过后自动发布；异常图单独保留，不拖住其他合格图片，也不会再要求你为上架手动整理清单。
