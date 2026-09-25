# Public UI model-name neutrality rollout

Beijing time: 2026-09-25 13:45 +08:00
Context: user requested that summary states and all public-facing Gallery copy not expose the model name.

Related product merge: 05f2266491bd7d92f4a6c657badb64ff223a3d67 (PR #241)
Related durable rule: ef3658784dee00c91d4453beef78dc9f7a7a7c03

Verification:
- Full src/user-ui scan on the implementation branch found zero case-insensitive model-name occurrences after the change.
- PR #241: all 10 pull-request workflows succeeded.
- Worker frontend assets deployment succeeded.
- Worker frontend sync succeeded.
- GitHub Pages deployment succeeded.
- Cloudflare Pages static fallback failed at the pre-existing Bridge runtime packaging/validation stage; this is outside the UI-copy scope and was not modified.
- Main paper-actions.ts and feedback-widget.ts both rechecked with zero public copy occurrences.

## Final user-visible reply

已经处理并上线。

现在用户能看到的前台文案统一改成中性表述，例如：
- “正在读取摘要状态…”
- “摘要正在处理中”
- “摘要已生成”
- 吐槽提交成功后改为“系统会汇总、去重并筛选值得处理的意见”

我也把整个用户界面源码重新扫了一遍，当前 main 的前台代码里已经没有该模型名称。PR #241 的 10 组检查全部通过，Worker 和 GitHub Pages 都已部署成功。

另外我已经把“前台不得暴露模型名称”写进项目规则，后续新增摘要状态、提示、错误信息等也必须保持这种中性表述。

Cloudflare Pages 的静态备用站这次仍在 Bridge runtime 打包校验处失败；这是另一条 Tampermonkey/Bridge 链路的问题，与这次界面文案无关，也不影响当前主站，所以这轮没有跨线修改它。