# ACS 2.2.68 connection-recovery checkpoint

Date: 2026-10-08
User: “连接已中断” after the ACS throughput/large-figure task was interrupted.

## Verified state
- Re-read current main rather than using an old branch; main already contains the independently merged ACS throughput release (Bridge 2.2.68, install 6.2.49).
- Deployment: Deploy Worker frontend assets run 37709482018 succeeded for ACS-release commit e9740832f, and live API installer direct read is 2.2.68 / 6.2.49. The primary gallery.gczhouwld.com installer direct read still returns 2.2.67 / 6.2.48; use the API URL rather than old primary host.
- New ACS test run 37709678114 succeeded; target journal regression originally failed from stale CCS fallback assertion and old version-pinned window guard test. These two test-only source assertions were updated in commits 392e5114b8e4efb7fd9bcf97a88fdd4bedece970 and 7d927034f2ec50063770f8e2d41f5063823eb1b9. Target journal follow-up run 37710129273 then completed success.
- The fixed ACS viewer/large image, bounded upload, universal verified Figure 1 primary visual code is present in current main. This is artifact/regression confirmation, not proof of end-to-end authenticated capture for every ACS article.
- Latest RSC 6.2.49-era server receipts 10.1039/d6sc05561c and 10.1039/d6sc05973b: both have TOC stored, body figures 0/0. RSC DOM figure_filter_summary shows nodes=26, noContext=9, official=1, noLabel=61, accepted=0. This is a real remaining RSC figure-label/DOM association defect, not an argument for publisher isolation. A live RSC publisher markup fetch in the cloud was bot-blocked; don't assert a DOM-selector fix from speculation.
- No additional ACS production changes were made in this recovery turn, to avoid overwriting newer main / concurrent chats.

## User-visible message (partial + completion)
“已恢复工作进度。**ACS 第二批修复已由并行任务合并并发布到 API 域名**，版本为 VPN Bridge **2.2.68 / 安装版 6.2.49**。目前主站安装入口仍是旧版 2.2.67，因此新版请使用：

[更新链接（VPN Bridge 2.2.68）](https://api.gczhouwld.com/gallery-vpn-bridge.user.js)

这批包含 ACS 大图资源解析、图片上传等待预算，以及 Figure 1 主图入库机制的修正。不过，代码上线不等于真实出版社抓取已全部恢复，我还在核对回归测试和最新回执。”

“已核验：2.2.68 安装包上线，ACS 专项及 CCS/RSC/Chem 定向回归通过；脚本兼容性旧断言也已更新。RSC 仍有正文图 0/0，日志显示 26 个图像节点却没有一个成功关联 Figure/Scheme 标签。下轮应依据这个真实结构信息修 RSC DOM，不采用隔离策略。更新后刷新 Gallery，再运行几篇即可提供新的真实抓取证据。”
