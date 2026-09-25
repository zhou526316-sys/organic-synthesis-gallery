北京时间 2026-09-25 18:00 固定发布已执行。严格预发布门禁 run 36117322293 成功：37 篇全部双遍审核，10 include、26 exclude、1 pending；正式转换和冻结 SHA 校验通过。原子生产发布 run 36121742931 成功，release commit a79d8c15c421d456190989370bb39e633b78cbab，生产卡片由 585 增至 595；唯一 deferred 为 10.31635/ccschem.026.202608262。

TOC demand run 36122290475 成功，当前 webpageDoiCount=595、visibleGapTotal=165、missingOfficialTotal=250、officialUpgradeTotal=85、figureGapTotal=595。Pages run 36122642167 的 literature_authorization、build、deploy 全部成功。真实 quality gate run 36122938736 回读确认 repositoryDois=595、deployedDois=595，并确认冻结发布子集有效。

但 post-release audit run 36121905668 发现 unresolved=13：除正式 deferred 外，又有 12 个冻结 handoff 后出现的未审核候选。因此 quality gate 按规则失败，未把这些新 DOI 临时改成 pending/exclude，也没有槽外补发。状态已持久化为 phase=sync_failed、publicationChecksPassed=false、reviewComplete=false，state commit 1deefef713af61d2209bab5bcfe4bb6954cea565。已上线的 10 篇保持有效；12 个新候选转入下一固定槽 2026-09-26 08:00 审核。verifiedThrough 仍为 2026-09-20。
