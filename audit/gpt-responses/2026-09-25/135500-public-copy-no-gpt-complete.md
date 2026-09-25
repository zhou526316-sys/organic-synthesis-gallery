# Public UI model-name wording cleanup complete

Beijing time: 2026-09-25 13:55 +08:00
Context: user required that summaries and all user-visible website locations not display GPT/gpt wording.

## Final user-visible reply

继续完成了。

现在主站所有用户可见前台文案已经统一去掉 **GPT/gpt**：

- 摘要加载：改成“正在读取摘要状态…”
- pending：改成“摘要正在处理中”
- stale / invalid：改成“摘要正在重新生成”
- 已完成：改成“摘要已生成”
- 吐槽提交成功提示也不再提模型名称
- 中英文两套文案都同步处理

线上核验也完成了：**gallery.gczhouwld.com** 与旧 GitHub Pages 入口实际渲染文本均为 **0 处 GPT/gpt**。PR #241 已上线，GitHub Pages 与 Worker 部署均成功。

另外我已经把这个要求做成永久 CI 规则，PR #245 已合并。以后只要前台源码或构建后的 HTML/JS 再出现 GPT/gpt，Site quality gate 会直接失败，不能正常合并。

唯一例外是旧的 **Cloudflare Pages fallback**：它目前无法重新部署，因为现有 Cloudflare API Token 对 Pages API 返回 **10000 Authentication error**。我已经修掉了它原先的 Bridge 打包校验错误（PR #243），现在剩下的是 Cloudflare 凭据权限问题，不是网页代码问题。这个 fallback 不是当前主站入口；当前正式主站已经完成去除。