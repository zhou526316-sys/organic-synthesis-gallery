# Registered users and feedback #35 completion

Beijing time: 2026-09-26 14:51 +08:00
Context: user asked “现在有多少人注册了本网站用户？以及继续解决新的吐槽。”

## Verified production user count
- Production D1 aggregate audit workflow: run 36223798215
- totalRegisteredUsers: 3
- localAccounts: 2
- externalAccounts: 1
- emailVerifiedUsers: 2
- Read-only aggregate only; no emails, names, IDs, sessions, or user-level records were exported.

## Latest feedback
- Export run 36223779767, generatedAt 2026-09-26T06:27:00.596Z.
- The only newly arrived feedback was #35: “建议吐槽界面可以直接粘贴图片而非去上传图片”.
- Existing UI supported file upload but not clipboard image paste, so the report was confirmed.

## Implementation and acceptance
- PR #258 merged as 4c9c2da095ee1b52d8d01fcb699f5027e86af5db.
- Existing upload remains.
- Clipboard image paste works with Ctrl+V / Cmd+V inside the open feedback panel.
- Text-only paste is not intercepted.
- Pasted images reuse the existing 20 MB validation, compression, preview, removal and private attachment path.
- All eight PR workflows passed.
- Worker deployment 36224253897 succeeded.
- Initial live smoke exposed stale static assets because the first GitHub Pages deployment was cancelled.
- Pages refresh run 36224579184 succeeded.
- Live smoke run 36224390759 attempt 2 passed in Chromium and WebKit against https://gallery.gczhouwld.com/, with zero production feedback writes.
- Feedback apply run 36224908585 succeeded: #35 -> reviewed.
- Open feedback after closeout: 12, exact IDs [8,20,21,22,23,24,25,28,31,32,34,r2:bd1346e7-aab7-40af-9ec5-0b031e750f0f].
- Pre-existing unresolved items remain paused.

## Final user-visible reply

目前生产数据库里共有 **3 个注册用户**。这是直接对生产 D1 的 `users` 表做只读聚合得到的，不是拿访问人数或登录会话估算的。

其中：
- **2 个本站注册账号**
- **1 个外部登录账号**
- **2 个用户已完成邮箱验证**

新的吐槽这轮只有 **1 条：#35**：

> “建议吐槽界面可以直接粘贴图片而非去上传图片”

这条已经解决并上线。现在吐槽窗口里：
- 仍然可以点“上传图片”；
- 也可以直接 **Ctrl+V / ⌘V 粘贴截图或图片**；
- 普通文字粘贴不会被干扰；
- 粘贴图片沿用原来的 **20 MB 上限、压缩、预览、删除和私有附件提交**流程。

对应 PR **#258**，合并提交为 `4c9c2da`。8 组 PR 检查全部通过。上线后我又在公开站 `gallery.gczhouwld.com` 上分别用 **Chromium 和 WebKit** 做了真实浏览器验收：粘贴图片、预览、删除均通过，并确认测试过程中 **0 次真实吐槽提交**。

中间确实发现一次上线不同步：最初的 GitHub Pages 发布被并发取消，所以线上还在读旧静态版本；我重新触发 Pages 发布后，run `36224579184` 成功，随后线上验收全部通过。

#35 现在已经标记为 **reviewed**。当前还剩 **12 条旧 open 吐槽**，全部保持你之前要求的“暂时不修复”状态，没有顺带关闭或修改。