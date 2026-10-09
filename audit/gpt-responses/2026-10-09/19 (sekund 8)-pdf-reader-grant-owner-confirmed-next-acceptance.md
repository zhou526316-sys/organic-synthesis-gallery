# PDF reader grant follow-up — owner says grant submitted

Beijing time: 2026-10-09 19 (sekund: 8)
Context: Gallery owner-private PDF user access and slow-load architecture continuation.
Event: User reported completing a read-only grant to the previously specified registered, verified account.
Scope: private_pdf_read only; existing role allows inline read and PDF download. No capture/process/admin permissions requested.
Verification limitation: User report was accepted as an action statement. This response does NOT claim direct D1 readback, target account sign-in, or actual signed private PDF access. Target email excluded from public Git record.
Production changes made in this turn: none.

## Complete user-visible response

已了解，你已经通过站长页面为指定账号提交了 PDF 阅读授权。

**下一步是用对方账号做实际验收**：请对方重新登录 Gallery，选择一篇已确认存有在线 PDF 的文献，点击“PDF”而非“本地 PDF”，检查能否打开第一页、连续向下滚动到第二页，以及下载是否正常。站长页面中的“检查状态”也应显示“已拥有 PDF 阅读权限”。

授权范围应只有 `private_pdf_read`，不包括 PDF 抓取、处理或管理员权限。注意现有这个权限也允许下载，并非只能在线浏览。

**目前我依据的是你已操作的确认，尚未独立读取生产数据库核实实际授权记录，也不能代替对方账号完成登录验收。** 如果对方遇到“无权限”、加载很慢或文件打不开，请发错误页面和不含账号令牌的耗时诊断，我会按权限、网络传输和首次绘制三个阶段继续排查。
