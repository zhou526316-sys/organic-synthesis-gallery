# Tampermonkey ACS 2.2.68 connection-resume reply

Date: 2026-10-08, Beijing time

User: "连接已中断" (twice), asking to continue ACS throughput repair.

This turn independently verified:
- Remote main contains ACS second-batch fixes already merged; no rewrite / force push was performed.
- API installation URL https://api.gczhouwld.com/gallery-vpn-bridge.user.js currently serves @version 2.2.68 / INSTALL_REVISION 6.2.49.
- Canonical Gallery installation URL still serves 2.2.67 / install 6.2.48; therefore use API installer.
- Worker deployment run 37709482018, ACS regression 37709678114, and target journal regression 37710129273 all completed success.
- Latest RSC receipts 10.1039/d6sc05561c and 10.1039/d6sc05973b still have body figures 0/0. They show 26 DOM image nodes, filter noLabel=61, accepted=0; the RSC caption/image association defect remains unresolved.
- No current-turn production modifications; this is a verification/checkpoint response, avoiding concurrent changes and additional timeout.

User-visible completion:

**VPN Bridge 2.2.68 / 安装版 6.2.49 已上线**，链接：https://api.gczhouwld.com/gallery-vpn-bridge.user.js

ACS 高分辨率大图解析、单张图片上传的总等待预算和 Figure 1 主图入库修复已合并。Worker 部署、ACS 专项、目标期刊回归均成功。主站固定安装入口目前仍显示旧版 2.2.67，请使用 API 链接安装并刷新 Gallery。以上是上线与测试通过，不等同于全部真实出版社抓取成功。

RSC 仍有正文图 0/0：最新 trace 表明 26 个图片节点存在，但 caption/label 匹配未成功；下一轮应针对真实 DOM 关联修复，不采用隔离失败论文的策略。
