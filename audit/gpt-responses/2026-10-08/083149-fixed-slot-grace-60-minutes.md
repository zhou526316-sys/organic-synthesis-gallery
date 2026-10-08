Organic Synthesis Gallery｜固定每日08:00生产槽技术窗口延长记录
北京时间：2026-10-08 08:31:49 (+08:00)

用户指令：那就把20分钟改成1小时。

已完成：将唯一北京08:00发布槽的技术执行窗口20分钟改为60分钟，仅允许同一逻辑槽在08:00至09:00内提交，仍不得新增09:00或18:00发布槽、改动准入时间、绕过审核/Pages gate。
原子GitHub main提交：38b2079c49060896523381329bc763f5554b1758。

修改文件：
- scripts/fixed-slot-release-handoff.mjs — expired_slot由20分钟改60分钟，commit-guard同步生效；
- scripts/apply-fixed-slot-literature-release.mjs — 请求实时时间窗口20改60；
- scripts/validate-production-literature-release-slot.mjs — SLOT_GRACE_MINUTES从20改60；
- scripts/test-fixed-slot-release-handoff.mjs — 新增59分钟、恰好60分钟仍可执行和超过60分钟一毫秒必须拒绝的边界测试；验证工作流timeout；
- .github/workflows/literature-fixed-slot-release.yml — writer job timeout-minutes从85改140，以覆盖至多65分钟提前arming加60分钟窗口及15分钟技术余量；
- docs/fixed-slot-release-handoff.md、docs/publication-release-contract.md — 对齐60分钟技术窗，不改变真实审核和固定发布规则。

GitHub Actions prepublish gate run 37708144655：Test automatic fixed-slot handoff and deployment provenance、staging/full review、prepublish slot window、per DOI release/deferred backlog、formal conversion、scope/title全部成功；正式发布prepublish gate失败，不能称为上线成功。实际blockers包括原staging仍绑定2026-10-07T23:09:41.981Z（北京时间10月8日07:09），而新paired latest/compact为2026-10-08T00:08:39.989Z（北京时间08:08）；214旧审核对215最新候选生成代不符，缺ACS Catalysis DOI 10.1021/acscatal.6c04987 的本槽正式决策，原staging globalBlockers未清除。快照晚于08:00不可倒填到pre-slot。

因此窗口修改成功不等于发布许可通过。生产marker仍指向2026-10-07T08:00:00+08:00，生产 DOI 859；不得凭成功测试/无变更Pages重新部署声称今日已新增。保留先前audit/carryovers/2026-10-08-missed-slot.json及nextSlotPublicationBacklog内28条审查证据，供下次正式审核使用。固定主审07:05、补审07:35、发布08:00任务仍保持启用。

本报告与最终用户反馈一致：窗口改为08:00–09:00已提交且基础测试通过；今日新增仍因独立审核条件未满足而未上线。
