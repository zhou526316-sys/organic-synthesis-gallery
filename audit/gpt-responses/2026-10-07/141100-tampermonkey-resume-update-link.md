# Tampermonkey guarded recovery batch delivered

- 北京时间：2026-10-07 14:11
- 对话：Tampermonkey 接续；用户 13:52:47 指示“继续，好了给我更新链接就行”。
- 修复分支源码提交：fc0b28ba67ef663c95d678d099a31e45e29b1608。
- 主线功能发布：0adbdc25e063f19f97c5ec688e1694470d9fcbbf。
- 共享旧测试断言修正：781262fb3475ec271c891bcbc2a24f9ec40276f3。
- Bridge 2.2.61 / 内部 installRevision 6.2.42；capture protocol 6.2.20 / controller 2.2.41 保持。

## 本批完成

刷新丢失执行器后的手动缺项任务可以受保护地继续。只恢复有可信同run执行中summary的孤立任务；暂停/ABORT/有效lease/新鲜active/10分钟保护窗口/已结束及异常终止均保持屏障。接管前先只读检查active，250ms租约确认后再次检查generation与所有权，再生成新run并以最新库存和已验证回执重算缺项。保留来源resumedFromRunId、所有凭据与媒体检查点、出版社冷却和旧回执隔离。现有60秒定时器可检查带孤立active的记录；不新增持续HTTP轮询。

本地16项恢复、19项立即开始、25项控制器、18项队列检查成功。实际浏览器共享存储下的两控制页竞争与面板验收、完整仓库missing-only和构建门禁均在37579215313成功。共享scheduler/retry门禁在37579699871成功；acquisition37579699872成功。Worker部署37579366221全部成功。

## 交付域名的明确限制

主站Pages run37579366338/job112655357136在“Verify V3 account sync and pause recovery before publication”失败，deploy skipped。没有跳过该用户中心门禁，没有反复重启部署，也没有修改架构/用户中心源码。首次短核验37579584401真实读到 canonical gallery 仍为2.2.60；Worker已为2.2.61。此状态未冒充“固定主站入口已更新”。

本次交付的是同项目已上线的API安装地址 https://api.gczhouwld.com/gallery-vpn-bridge.user.js 。只读核验37580014184成功：API与Worker原始脚本字节均等于已测试canonical构建产物SHA256 954ead8f60a23735946fc89d7ab9059257c140721bfa83e7f701b23ecc104fa3，HTTP200，版本/恢复marker/协议/controller均通过。安装脚本内updateURL/downloadURL仍指向既有gallery主域，主站后续由架构发布正常接续。本轮不宣称主站Pages整体部署成功。

分层采集失败原因展示和RSC新版实际回执验证仍未在本批处理；不标记已修复。

## 线上证据

```json
{
  "checkedAt": "2026-10-07T06:09:59.418Z",
  "sourceSha": "0e8158b839e8f65f90f46f261abc1489782d171d",
  "deliveryTarget": "api",
  "readOnly": true,
  "productionWrites": 0,
  "publisherRequests": 0,
  "expected": {
    "bridgeVersion": "2.2.61",
    "installRevision": "6.2.42",
    "captureProtocol": "6.2.20",
    "controllerRevision": "2.2.41",
    "manualRecoveryRevision": "20261007-manual-resume-v1"
  },
  "expectedInstallerSha256": "954ead8f60a23735946fc89d7ab9059257c140721bfa83e7f701b23ecc104fa3",
  "passed": true,
  "probes": [
    {
      "key": "api",
      "url": "https://api.gczhouwld.com/gallery-vpn-bridge.user.js",
      "passed": true,
      "status": 200,
      "contentType": "text/javascript",
      "bytes": 366091,
      "sha256": "954ead8f60a23735946fc89d7ab9059257c140721bfa83e7f701b23ecc104fa3",
      "bridgeVersion": "2.2.61",
      "updateUrl": "https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js",
      "downloadUrl": "https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js",
      "installRevision": "6.2.42",
      "captureProtocol": "6.2.20",
      "controllerRevision": "2.2.41",
      "manualRecoveryRevision": "20261007-manual-resume-v1",
      "matchesExpectedSha256": true
    },
    {
      "key": "worker",
      "url": "https://organic-synthesis-gallery.zhou526316.workers.dev/gallery-vpn-bridge.user.js",
      "passed": true,
      "status": 200,
      "contentType": "text/javascript",
      "bytes": 366091,
      "sha256": "954ead8f60a23735946fc89d7ab9059257c140721bfa83e7f701b23ecc104fa3",
      "bridgeVersion": "2.2.61",
      "updateUrl": "https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js",
      "downloadUrl": "https://gallery.gczhouwld.com/gallery-vpn-bridge.user.js",
      "installRevision": "6.2.42",
      "captureProtocol": "6.2.20",
      "controllerRevision": "2.2.41",
      "manualRecoveryRevision": "20261007-manual-resume-v1",
      "matchesExpectedSha256": true
    }
  ],
  "sameInstallerBytes": true,
  "verifiedAt": "2026-10-07T06:09:59.927Z"
}
```

## 用户完整回复（按要求仅提供链接）

[更新链接（VPN Bridge 2.2.61）](https://api.gczhouwld.com/gallery-vpn-bridge.user.js)
