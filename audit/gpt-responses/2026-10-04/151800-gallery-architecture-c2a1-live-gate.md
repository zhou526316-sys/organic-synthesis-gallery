# Gallery architecture continuation — C2a.1 production gate

Beijing time: 2026-10-04 15:18 +08:00
Context: continue approved Gallery architecture construction
C2a.1 merge: c0af1fd3fb6c91f18c3a478bbbd582a5ac56152e
Pages live verification run: 37184940322
C2b filtering enabled: false

---

**继续完成到 C2a.1 的生产安全门槛了，但我没有越过门槛启用 C2b。**

C2a.1 已合并，合并提交为 **`c0af1fd3fb6c91f18c3a478bbbd582a5ac56152e`**。GitHub Pages run **`37184940322`** 已完成构建、部署和双入口线上字节核验。

当前已经确认上线的是：

- 自包含 VPN Bridge：**2.2.40**
- standalone userscript 安装版本：**6.2.22**
- 内部 capture protocol：仍为 **6.2.20**
- controller：仍为 **2.2.39**
- 新 Architecture v2：**785 篇**
- 2026-10-04 北京时间 cutoff：**2026-07-04**
- Hot：**762 篇**
- Archive：**23 篇**
- 当前 Catalog ID：`669ce6a111c123220f7db47d14433813b658bd029f7ab19e0888006c7788a84d`

这批 Catalog、Locator、Search、membership 等架构对象已经在正式域名和 Pages 入口逐字节验证通过，所以 **C1/C2a 的线上事实层已经成立**。

但我随后检查了部署后的真实 Tampermonkey 报告。已经有真实浏览器在 C2a.1 部署之后继续抓文献，例如最新检查到的 `10.1021/jacs.6c13570` 报告已经发生在部署之后；但是 raw trace 里仍然**没有**

```
architecture_membership
verified_snapshot
```

也没有出现当前 Catalog ID、785 / 762 / 23 这组 observer 证据。

这说明目前可以证明“真实浏览器仍在工作”，但还不能证明**这个实际运行中的浏览器实例已经加载并执行了新的 membership observer**。很可能是当前正在工作的出版社标签页仍是更新前已经启动的脚本实例；仅凭线上安装包已经更新到 2.2.40，不能把这一点当作已经验证。

因此我严格停在这里：

> **C2b 三个月任务过滤尚未启用。**

目前没有发生以下变化：

- 没有把 23 篇 Archive 从 canonical membership 删除；
- 没有停止或清空它们已有的 TOC／正文图／Evidence／checkpoint；
- 没有把 `toc-demand-live.json` 裁成 Hot-only；
- 没有改变当前 Tampermonkey 任务选择；
- 没有切换前端首页到 Hot-only；
- 没有修改 08:00 / 18:00 文献发布链。

这是刻意设置的 fail-closed 门禁，不是部署失败。

进入 C2b 的唯一条件现在已经很明确：下一份真实安装浏览器报告中必须出现 `architecture_membership / verified_snapshot`，并且其中的 catalogId、memberCount、hotCount、archiveCount、cutoff 与当时最新的 Verified Architecture Generation 一致。满足后，再把“全站成员表”和“活跃抓取资格”真正接入队列。

本轮门禁证据已经写入：

`audit/architecture/2026-10-04-c2a1-real-browser-gate.json`

审计提交为 **`2d9f6157e7e05064d1cec2018d3fe8e3e600ef78`**。

所以当前架构进度可以准确表示为：

```
Phase A   Canonical / Lifecycle / Locator
    ✅

Phase B1  Membership fence / Archive≠删除 / 浏览器显示兼容
    ✅

Phase C1  新 Catalog / Search / Locator 正式随 Pages 发布并线上验证
    ✅

Phase C2a 真实 Tampermonkey membership observer
    ✅ 已上线

Phase C2a.1 Bridge 自动更新 + observer 诊断回传能力
    ✅ 已上线

真实浏览器 observer 回执
    ⏳ 尚未观察到

Phase C2b 三个月 Active Work 过滤
    ⛔ 尚未启用

前端 Hot / Archive 正式切换
    ⛔ 尚未启用
```

下一次继续时，我会首先重新读取最新真实 Tampermonkey report；**一旦 observer 回执满足门禁，就直接从当前最新 `main` 构建 C2b，不会回头使用已经关闭的旧 PR #272。**
