# Feedback approval boundary — user interruption

Beijing time: 2026-09-23T17:01:32+08:00
User instruction: “吐槽不要直接修，要先给我核实，我来决定。”
Context: UI/feedback continuation after crop PR157 deployment; interruption during reader-counter PR163 investigation.
Policy commit: f490fd140c797e1e59eb4d07841a11f64c22ade9, PROJECT_RULES.md.
PR163 readback: open, merged=false, exact head ba599e19a43fdb6cafbc2a2dd1bea8ceb9f34884. Explicit HOLD comment5792003980 added. Navigation PR150 was already on hold and the project rule now requires user approval before any advance. No repair source/test changes, merges, releases, counter corrections or feedback status changes were made after this instruction. Only the requested approval policy and hold documentation were written. Existing independently authorized publication/acquisition workflows were not disabled or rescheduled.

## Immediate user-visible acknowledgement

收到。后续吐槽先核实问题、影响和处理方案，交给你决定；未经你明确批准，不改代码、不合并上线，也不关闭反馈。当前尚未上线的修复先暂停推进。

## Final reply

明白。**后续吐槽一律先核实、再报给你，由你决定是否修复及优先顺序。**

我会先整理每条的**编号与原文、是否复现、影响范围、建议改法和风险**，不再把收到吐槽等同于获准修改。只有你明确批准的条目，才开始改代码、合并上线；完成验收后再处理反馈状态。

**你单独说“继续”，默认只继续核实和整理，不代表批准新的修复。** 这条审批规则已写入项目规则。fileciteturn994file0L2-L2

当前尚未上线的**顶部／底部导航（PR #150）和阅读计数修复（PR #163）已暂停推进，等待你的决定**；已上线的裁切、卡片光效和双指缩放保持不动。fileciteturn994file0L2-L2
