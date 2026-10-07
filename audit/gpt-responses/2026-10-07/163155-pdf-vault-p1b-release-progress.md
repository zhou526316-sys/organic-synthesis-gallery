# PDF Vault P1b release progress

Date: 2026-10-07 (Asia/Shanghai)

## Assistant commentary (verbatim)

### Update 1

后端已保存到主分支并开始正式部署。浏览器检查也确认了性能边界：电脑 24 张、手机 12 张卡片各用一次队列批量查询，首页不会读取 PDF 文件或计算文件 hash。接下来收尾卡片状态回归和线上 API 验收。

### Update 2

浏览器端这一批已通过：本地库和队列 21 项、主卡与站长入口 16 项全部通过。线上验收发现了两个问题：旧迁移测试的基线截取方式需要更新，线上队列验收脚本的建号与清理核验也需要修复。我会先把这两个问题处理完，再确认正式上线结果。

### Update 3

迁移测试已修复，21 项约束检查全部通过，原有的账号归属、外键和幂等性断言都保留了。线上脚本的问题也已缩小到 D1 命令的返回值处理；我会补上明确的清理查询，核实这次验收用的临时账号没有遗留。

### Update 4

实现和本地回归已收齐，正在提交并走正式发布流程。本批的实际用法是：手机加入“待电脑获取”，电脑登录同一账号后继续处理；卡片则根据本机检查结果显示“本机”“待检查”或“待电脑”，任务完成本身不会被当作 PDF 已可读。

## Reviewable checkpoint

Backend checkpoint: `441580919ae5f53e9bfc0926db6abc7d114f13e6`.

Local validation: 76 Node tests, 21 real SQLite schema tests, 21 PDF Vault browser cases, and 16 private-PDF/main-card cases all pass. Chromium uses real IndexedDB/OPFS and PDF.js; native Windows picker prompts are not claimed tested. Same-account cross-device queue uses API fixtures in browser tests. Real API acceptance is a separate canonical Worker canary.

Initial Worker run 37593331980 deployed the route but its live canary failed after unauthenticated acceptance. The canary incorrectly parsed the remote Wrangler file-import path as pure query JSON. Tiny fixtures now use the query command path, cleanup is independently SELECT-verified, and the two exact synthetic IDs from that failed run are included in cleanup. No prefix or wildcard account deletion is used. Production acceptance remains pending a successful new run and verified cleanup.

P0 run 37593331623 failed only the isolated migration schema comparison: its baseline discarded all content after the P0 BEGIN marker. The updated test removes just P0 BEGIN/END, retains later independent modules, and keeps complete-schema signature equality, ownership, foreign key and idempotence assertions.

Scope: metadata-only account queue; explicit completion; truthful short-lived main-card hints; 24 desktop/12 mobile batch behavior. No publisher credentials, user PDF bytes, local paths/handles/hash or full text are uploaded. Owner R2/private PDF remains separate; ordinary V3 write rollout remains disabled.

Production status and exact delivery/run evidence will be recorded after canonical gates finish.
