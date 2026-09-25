# Public UI model-name removal final status

Beijing time: 2026-09-25 13:52 +08:00
Context: continue removal of model-name wording from all public UI surfaces.

## Final user-visible reply

继续完成了。

现在主站这一项已经处理到位：

- PR #241 已合并，10 组检查全部通过。
- 摘要中的“等待 GPT 审核 / GPT 审核通过 / GPT review”等前台文案已经全部改成中性状态，例如“摘要正在处理中”“摘要已生成”。
- 吐槽提交成功提示里原先提到 GPT 的一句也已删除。
- 我把公开前端源码完整扫了一遍，`src/` 的用户界面代码中已经没有 `GPT/gpt` 字样。
- 对正式站 `gallery.gczhouwld.com` 和旧 GitHub Pages 入口做了线上渲染文本复查，两边均为 **0 处 GPT/gpt**。

另外，Cloudflare Pages 备用站的 Bridge 打包校验错误也已经修好，PR #243 的 9 组保护性检查全部通过并已合并。现在它剩下的失败不是代码，而是 GitHub 中现有 `CLOUDFLARE_API_TOKEN` 缺少 Cloudflare Pages 的写权限；Cloudflare 官方要求 Pages 部署令牌具备 **Cloudflare Pages Edit / Pages Write**。在这个权限补上以前，那个备用 `pages.dev` 部署无法刷新。

所以目前：**实际使用的主站前台已经不再出现 GPT 字样；唯一未同步的是被 Cloudflare 权限挡住的备用 Pages 部署。** 内部模型配置、API 参数和审计记录没有改名，不会显示给网站用户，也不会影响摘要生成。