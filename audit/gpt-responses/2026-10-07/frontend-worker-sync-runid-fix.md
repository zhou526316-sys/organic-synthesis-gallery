Beijing time: 2026-10-07 00:xx +08:00
Context: Gallery performance / frontend Worker sync repair
Related commits: 2d509df61d68ce6182d1faadf83131a0c5bca4bf
Related Worker run: 37492317642

User-visible reply:

这一小批已经继续完成。

这次发现上一轮 Hot-first 并不是代码构建失败，而是发布编排误报：frontend-worker-sync 成功触发了 Worker run 37492317642，但随后仍用触发同步任务时的旧 GITHUB_SHA 去反查 run；main 在这几十秒内又有新提交，所以它始终匹配不到刚刚触发的 run，最后误报失败。

我已经把这一逻辑改成：直接从 gh workflow run 的返回 URL 解析真实 run id，并把后续等待/验收绑定到这个确切 run，不再依赖会漂移的 main HEAD。提交为 2d509df61d68ce6182d1faadf83131a0c5bca4bf。

刚才只查了一次真实 Worker run 37492317642：目前仍在运行，但没有失败项，已经通过用户库 V3、Evidence Index、scheduled handoff、summary candidate 等步骤，进行到正式 TOC promotion。说明 Hot-first 版本本身没有在构建/部署前半段失败。

我没有继续轮询，避免再次触发聊天超时。下一批可以继续做正式上线后的单次测速和剩余首屏瓶颈优化。