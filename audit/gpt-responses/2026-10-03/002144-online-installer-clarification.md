# Online installer link clarification

Beijing time: 2026-10-03T00:21:44+08:00
Context: Tampermonkey continuous-capture handoff; user requests an online installation link, not a script attachment.
User request: 给出链接不是代码文件
Read baseline main: c4d7bce8e8f21e9800d3e635965cf48d25532997. Current public/toc-mainline.user.js blob1c9bad4783d5ff9495973e31f4f15b05b3e68468 still contains MISSING_CAPTURE_REVISION=20261002-missing-only-v4. Continuous-v5 local delivery and blocked source write are recorded in commit0f903ebc0a2061e42520d714916bd62688ef8e5a on the existing repair branch. This turn does not retry the blocked code operation or route it through another channel. No code/deployment change was performed. The link below is the existing canonical installation endpoint, explicitly not an online continuous-v5 release. No fresh live-origin probe is claimed.

## Progress message

我先核对线上安装包，给你能直接打开 Tampermonkey 更新页的链接，避免发到旧版。

## Final response

**[在线安装入口：Tampermonkey 抓取脚本](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js)**

**注意：这个入口目前仍对应“缺项补抓4”，不是“连续到底5”。** 我刚核对仓库，连续版的代码写入此前被拦截，尚未进入正式版本，因此现在没有可用的连续版在线更新链接。fileciteturn221file0L2-L2 fileciteturn220file0L7-L7

前两次给的是下载附件，没有满足你要的在线更新方式。**已经安装“连续到底5”的话，不要用上面的旧版入口覆盖。**
