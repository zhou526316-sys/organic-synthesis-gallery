# Manual resume shared-test contract checkpoint

- 北京时间：2026-10-07 14:06
- 对话：用户要求继续修复，完成后仅返回更新链接。
- 已发布功能提交：0adbdc25e063f19f97c5ec688e1694470d9fcbbf；修复分支浏览器/Node/构建run37579215313全部成功。
- 已测安装包SHA256：954ead8f60a23735946fc89d7ab9059257c140721bfa83e7f701b23ecc104fa3。

主线旧回归受共同静态断言影响：tests/tm-newest-retry.test.mjs:41要求匿名setInterval结束字符串 '}, 60 * 1000);'，本轮改为命名controllerTick但仍60秒。queue37579366460/job112655287375与immediate37579366400/job112655286892均精确失败于该断言；前置queue/controller测试已通过。

本提交只将该断言改为校验命名controllerTick及相同60000ms表达式，保留该测试的队列刷新顺序/结果保持断言和所有权限/来源保护。专用工作流增加2分钟scheduler_contract（main与修复分支），执行priority/newest/recovery Node检查；重型浏览器构建仍只在修复分支运行。真实运行间隔与采集源码不变，不触发第二次部署。

线上安装包短probe37579584401报告失败，正在读取小JSON确认原因；不先声称线上字节一致。主域Worker前端构建/上传步骤已成功，其余部署后检查仍运行。

## 用户进度说明

线上脚本已发布。最后在核对安装包字节，并修正一条仍依赖旧定时器写法的测试断言；这项修正不会再触发部署。
