# Feedback #37 completion

Beijing time: 2026-10-04 17:17 +08:00

## Result
- PR #289 merged as c2c3cc9c5f9d68096ad13803a532930a06ef1812.
- Desktop summary is taller and vertically stacked: image above text.
- Mobile compact layout preserved.
- Readable summary layout regression 37190994743: success.
- Site quality gate 37190994684: success.
- Worker sync 37191248388: success.
- GitHub Pages deployment 37191248410: success.
- Cloudflare Pages fallback 37191248326: failed on pre-existing API authentication error code 10000; not caused by #37.
- Feedback apply 37191590282: success; #37 -> reviewed.
- Previous 12 feedback items remain open/paused.
- Unrelated Bridge Evidence regression failed because it asserts obsolete Bridge 2.2.35; no Tampermonkey changes were made.

## Final user-visible reply

#37 已修复并上线。

桌面端文献摘要现在改成：
- 摘要窗口更高，约占桌面视窗高度的 92%，仍保留边距，不做全屏；
- TOC / graphical abstract 放在上方；
- 中文/英文摘要文字放在下方；
- 中英文切换、生成信息和“打开原文”继续保留；
- 手机端继续使用原来的紧凑尺寸，没有一起放大。

对应 PR #289，合并提交为 c2c3cc9c5f9d68096ad13803a532930a06ef1812。摘要布局专项和整站 Site quality gate 都通过；Worker 同步 run 37191248388 成功，GitHub Pages 主站部署 run 37191248410 成功。#37 的状态更新 run 37191590282 也已成功，已标记为 reviewed。

Cloudflare Pages 备用入口仍有原来的 token 10000 鉴权问题，但不影响 gallery.gczhouwld.com 主站和 Worker，本次没有跨线修改它。

当前剩余 12 条旧吐槽继续保持暂停，没有顺带修改。
