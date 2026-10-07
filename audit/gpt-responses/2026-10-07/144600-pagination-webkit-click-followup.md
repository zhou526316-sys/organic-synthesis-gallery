Beijing date: 2026-10-07
Context: approved pagination UI continuation; WebKit click-target follow-up.
Parent: dd99d4df601eaef126745e924c7bd5d6c661b93e
Run 37582961206: Chromium job passed; WebKit artifact 11465098998 SHA256 e6352f18293a7061a294df0c44f7f9627f60fa52778da8163d86f64fc9c5519c downloaded. WebKit passed all 10 layout/navigation cases and drag-away/Enter; failed the two deliberately shifted-footer cases. The first pointer-capture-only attempt is not declared fixed or shipped.

Replaced pointer capture with tightly scoped completion reconciliation: record only a primary mouse press on an enabled pagination button; require a real matching release within its original hitbox; on an actual non-keyboard click, forward once only if the button moved >=2px, remains enabled/visible/connected, and the event was retargeted away. Consume the retargeted event so it cannot accidentally activate another card. No activation on down/up, no synthetic action after pointer cancellation, no touch changes. Original failing and deliberate-shift assertions stay unchanged.
Status: new branch candidate; browser and full gate pending. No production mutation, merge or feedback closure.

Progress text:
修复已提交：翻页仍在鼠标松开后触发，但会保留按下时的按钮目标；拖出按钮取消、键盘跳页和触屏操作保持原有行为。正在重跑原先失败的用例。
Chromium 已通过，但 WebKit 的“按钮在按下后移位”补测仍有两项失败。第一版还不足以解决兼容性问题，我正在修正，暂不合并。
