Beijing date: 2026-10-07
Context: approved pagination repair continuation; test preparation only.
Parent: 4259819ae797ced3d834ba406aad9d7f1aac68ca
Run 37584743004: Chromium passed all 13 tests. WebKit artifact 11466178044 (SHA256 6dee8b0ffbed516c179df54a850feca35886d7158d9c1a01645735c33210c94d) reports 12 passed, one failed. Both deliberately shifted-footer tests passed. The one failure was before any drag assertion: native down did not hit the second-page button after hover.
This change waits for a verified settled hover hit (native mouse position, rectangle and elementFromPoint) before making exactly one down/up. Does not retry clicks, change expected pages, remove assertions or skip failures. The two original archive tests remain completely unchanged. Runtime source unchanged from 4259819.
A separate minimal in-memory Chromium harness for the new runtime passed normal click, shift-after-down, shift-during-down, drag-away cancellation and keyboard activation. This is a unit harness, not a full site or production browser pass. Full repository gate is still pending.

Progress text:
这版改用真实按下坐标识别有效点击，并保留拖出取消。补测也新增了“确实按到第 2 页”的检查，正在验证原始失败场景。
两种浏览器的强制移位测试都已通过。剩下一项失败发生在测试按下前的定位阶段；我正在固定命中条件，不删除拖出取消或键盘测试。
