Beijing time: 2026-10-07 00:xx +08:00
Context: Gallery startup performance continuation
Related commits: 5a9a2e80b82a42e076b621c4375123a58a9719fa, 826eb900fccc2b999a0dce292a291eff314f35c0, 949605e30b44e5b4d56be38a58ddd725a0030544, 3025fea7d8b4a3d9fb816f312e0a18d770030bd0

User-visible reply:

这一批继续完成了首屏架构优化。

现在默认首页不再等待“全历史 membership + catalog”全部验证完成才显示内容，而是：
1. 先并行校验 release-delivery 和 architecture release；
2. 读取并校验已经内容寻址/哈希绑定的 Hot 快照；
3. 立即渲染近三个月卡片；
4. 同时后台完成全历史 membership、catalog 和 Archive 搜索能力初始化；
5. 后台完成后无刷新升级为完整 architecture-v1。

共享 DOI、公众号 edition、已有历史日期筛选这些可能需要 Archive 的入口仍走完整验证，不会为了速度牺牲正确性。

另外修正了上一轮的回归常量：桌面窗口的共享基准从 60 正式改为 24；手机仍由前端响应式控制为 2 张/页。并新增了一条浏览器回归测试：故意卡住 membership 时，Hot 首页必须仍能先显示，membership 恢复后再升级成全历史完整状态。

当前相关发布任务仍在执行，没有查询到失败结论。我没有继续轮询，避免再次触发聊天超时。