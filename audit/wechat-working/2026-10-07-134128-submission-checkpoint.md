# WeChat revision / submission checkpoint

Beijing time: 2026-10-07 13:41:28 +08:00
Context: user requested cover changes, stronger solvated-electron explanation, solvent-cage distinction and peer-review discussion, then asked why submission was unavailable.

## Observed transport state

- The GitHub connection exposes create_file and update_file in this turn. This checkpoint is a real UTF-8 contents-API write, not a simulated commit.
- The existing latest daily receipt reports a successful draft_update and draft/get at 2026-10-07T05:04:05.290392Z for the two-article 2026-10-07 edition. This is the previous revision, not completion of the new requested changes.
- audit/automation-triggers/wechat-publisher-request.json is still requestId wechat-daily-2026-10-07-r7-source-locked-final (blob 1e31546bd616744f7d0d09977eb79507dde6c473).
- No new publisher trigger or failed WeChat submission has occurred in this turn. The new changes are still under editorial preparation. Do not describe an unattempted submission as a permission/API failure.
- Do not ask the user to paste API keys. Existing fixed-IP relay and GitHub Actions secrets remain the established draft-transport path. No credentials have been inspected.

## Exact active source files

Daily: public/wechat-featured/2026-10-07.json, observed blob 3a0cae9403c03b43e9f083d6098dbf7a2a83034c.
Bundled retrospective: public/wechat-retrospective/phoenix1-structural-regeneration.json, observed blob 8b1c61af3aa684fbe16be73240a1f461ec72fe4d.
Daily review gate: audit/wechat-working/2026-10-07-review-gate.json, observed blob 511b44dd039b2780bc2a50feff79aa4328b0e238.
The separate phoenix1-bimodal-structural-regeneration.json is not the retrospective manifest currently used by the two-article daily bundle. Update the actual bundled source, not just this separate draft.

## User-approved revision scope

1. Enlarge the original Angew structure image across the upper area above the title; remove the undersized strip caused by the previous square-safe layout. Do not generatively redraw chemistry.
2. Use the user's confirmed whole phoenix artwork for the retrospective cover, not a screenshot or a new cropped-inset composition. Preserve source geometry and inspect actual 1:1/2.35:1 presentation without claiming the secondary WeChat card becomes a full-width card.
3. Explain conventional excited-state SET, oxidative and reductive quenching, followed by the distinction between a solvent cage and a solvated-electron state. Cage escape separates reaction partners; it does not by itself eject an electron from its molecular state. Keep this educational explanation separate from observations in the phoenix1 paper, and verify its external primary references before passing review.
4. Expand the hierarchy of solvated-electron evidence and retain parallel SET/XAT and the productive route involving 10.
5. Discuss actual Nature Catalysis peer-review comments. For Angew, no peer-review report is among the supplied main/SI materials: label critical questions as editorial analysis, not invented reviewer comments.
6. Preserve the existing narrative structure and all scientifically relevant original figures.

## Verified replacement paragraph for the Nature Catalysis review discussion

同行评议文件把争论的焦点说得很清楚：审稿人1最初并不是否认体系里存在强还原物种，而是质疑这些实验能否进一步把它唯一指认为溶剂化电子。蒽相对容易还原，而且可能经其他路径氢化；硝酸钾也可能清除其他强SET还原剂；DMPO捕获物同样存在归属的特异性问题。因此，蒽还原、清除剂效应和EPR不能各自独立完成溶剂化电子的鉴定。

作者随后补充400 nm泵浦的超快瞬态吸收，将520 nm附近的自由基11信号与600 nm以上的宽吸收分开分析，并用加入受体1后650 nm信号的后续演化变化检验归属。作者在回复中明确承认：超快瞬态吸收是核心依据，EPR、清除剂和反应性测试属于补充支持，不是各自独立的证明。其所观察的长波部分是预期近红外宽带的短波侧，不能写成已经完整测到了该电子吸收带的峰顶。

最终一轮中，审稿人1认为新增TA数据足以支持这些条件下可能形成一定量溶剂化电子，但仍不确定它们对实际合成反应的贡献程度。审稿人3则认可作者补充的计算说明。结论应分成两层：光电离及电子信号形成的光谱依据得到加强；这些电子在完整催化网络中承担多少生产性还原，仍不能由论文获接受这一事实替代证明。

Source provenance: user-supplied Nature Catalysis Peer Review File, pp.1–3 and pp.5–8; original article Fig.3; SI Figs.68 and 70. The publication file and SI are not uploaded by this checkpoint.

## Useful new source checks completed in this turn

- SI printed p.88 / physical page89: laser-energy dependence in Fig.59 supports a linear response for radical11 formation under the measured 355-nm LFP conditions. The reported 21% estimate is photoionization efficiency inferred from radical stoichiometry, not the synthetic product quantum yield.
- SI printed pp.111–112 / physical pages112–113: Figs.79–81 distinguish laser and 400-nm irradiation EPR experiments. The weak later electron-related spin-adduct signature must not be described as a directly measured free-electron concentration.

## Hold

This checkpoint does not change either production manifest, invalidate the existing published draft, mark a new gate passed, or invoke the publisher. New cover bytes and revised text must be reviewed together and pinned before a single serialized draft-only trigger. Actual updated draft/get receipt is required before reporting that the requested changes are visible in the WeChat draft.
