# Canonical Tampermonkey installation link

Context: user reports “这个链接不跳转啊” for the workers.dev v6 online installer. Reply synchronized on 2026-10-04, Beijing time approximately10:00.

## Fresh verification

Read existing Pages deployment run37041269927 and confirmed authorization/build/deploy jobs all completed successfully for source f2a6f3875df5b04f5935f3d8b20d542d238f63b9. Read .github/workflows/tm-queue-coverage-live.yml at9bb4ba16f46fe06a7aa7e7483d065db4b176558f and reran ONLY the failed read-only verification job, not any deployment or capture. Run37041362553 latest job111339761689 returned passed=true at2026-10-04T01:58:59.121Z (Beijing09:58:59), artifact11290554574.

Canonical URL https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js returnedHTTP200; SHA256621c82fbe4170d6dd33b5b3f1c2689b600a4d3daf607f7b3fb52bda0cda33425;281274bytes;version2.2.39;QUEUE_COVERAGE_REVISION20261003-queue-coverage-v6;panel全队列补缺6;button立即开始任务（只补缺项）. Exact bytes matched previously tested installer. Worker URL also returned200, but this does not establish why the user's click failed or prove accessibility from their browser. No publisher requests, media writes, code modifications or new scheduled tasks. This check supersedes the earlier acceptance snapshot where canonical Pages still servedv4.

Direct web-tool reading was unsupported and container DNS resolution failed; neither was treated as proof of a site outage. Public content was independently verified by the existing Actions read-only verifier. Authenticated user-desktop adoption remains unverified.

## Progress message

主站部署现在已经完成。我正在核对主站安装包是否已更新为“全队列补缺6”，这次不再给你 `workers.dev` 地址。

## Final reply

改用主站这个在线安装链接，不再走刚才的 `workers.dev`：

**[点击在线更新：Tampermonkey 2.2.39 · 全队列补缺6](https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js?fix=20261003-queue-coverage-v6)**

**刚重新核验：主站已返回新版“全队列补缺6”，安装包与测试版本一致，不是之前的“缺项补抓4”。**

打开后覆盖安装原脚本，**不要卸载或清空数据**。随后刷新文献库网页，确认面板显示“全队列补缺6”，再点“立即开始任务（只补缺项）”。

如果在聊天里点击没有反应，右键上方链接选择“复制链接地址”，粘贴到已安装 Tampermonkey 的浏览器地址栏后回车。
