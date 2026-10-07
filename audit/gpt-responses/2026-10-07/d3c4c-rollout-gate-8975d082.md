Beijing time: 2026-10-07 08:xx +08:00
Context: Gallery architecture D3c4c gradual V3 write rollout gate
Related commit: 8975d082fce8034741377744f25da4b06b1dfe2b

User-visible reply:

继续完成了下一阶段，但没有直接打开正式用户的 V3 写。

本轮新增 D3c4c 渐进式 rollout gate：
- 全局 USER_LIBRARY_V3_WRITE_ENABLED 仍为 0；
- 新增 USER_LIBRARY_V3_WRITE_ROLLOUT_BPS，生产默认 0，也就是 0%；
- 保留已验证的 D3c4b 专用 canary user；
- 普通用户通过固定 seed + user id 的稳定哈希进入确定性 cohort；
- 同一账号不会因刷新、换设备或重新登录而随机进出 cohort；
- rollout 阈值增加时只会单调增加用户，不会重新洗牌；
- 阈值降回 0 时停止新的 cohort 写，已进入 V3 authority 的账号继续遵循现有 fail-safe write-suspended 规则，不会回退到过期 monolithic document。

计划的渐进档位已固化为：
0 bp → 50 bp(0.5%) → 100 bp(1%) → 500 bp(5%) → 1000 bp(10%) → 2500 bp(25%) → 5000 bp(50%) → 10000 bp(100%)。

同时补了单元测试和部署契约，确保：
- 0 bp 时普通用户一定关闭；
- canary 在 0 bp 时仍可写；
- cohort 选择稳定；
- 10000 bp 才覆盖全部；
- 非整数/非法阈值 fail closed 到 0；
- 全局开关仍具有最高优先级。

这意味着现在已经具备从“单个生产 canary”进入“可回滚小比例正式 rollout”的控制面，但当前实际生产仍是 0%，没有正常用户被切换。