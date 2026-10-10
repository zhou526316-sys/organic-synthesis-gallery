# 2026-10-10 Architecture/PDF: PowerShell script-block invocation correction

Chat: 接续架构和PDF 腾讯网关 Diagnose；用户贴出 `>>` PowerShell 续行和原样回显的四行命令，但没有 SSH/DIAG 结果。

## User-visible reply

问题找到了：**PowerShell 并没有真正执行诊断脚本。**

上次提供的代码块意外包含了最外层的 `{ }`，PowerShell 将其识别为脚本块，只显示其中的命令，而没有执行。你看到的 `>>` 是多行输入提示符。

抱歉，这是我提供的命令格式有误。

### 请重新执行

如果 PowerShell 仍显示 `>>`，先按 `Ctrl + C`，然后直接复制以下四行：

```powershell
$u = 'https://raw.githubusercontent.com/zhou526316-sys/organic-synthesis-gallery/3d9362036044f43d2b7299a041cfc206b599bf60/deploy/pdf-gateway/run-once-from-windows.ps1'
$p = Join-Path $env:TEMP 'gallery-pdf-nginx-diagnose.ps1'
Invoke-WebRequest -Uri $u -OutFile $p -UseBasicParsing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Mode Diagnose
```

注意：**不要添加 `{}`，也不要复制 `>>`。**

正常运行后应该出现：

```text
Gallery PDF: Diagnose / one SSH login / no new paid service
```

随后通过微信扫码完成 SSH 登录，脚本会输出 `[DIAG]` 诊断信息。

本次仍是只读诊断，不会修改服务器配置或申请证书。

## Completion note

请发送 `[DIAG]` 开头的诊断输出；无需私钥、账号密码、二维码登录 URL 或含 token 的私有 PDF 链接。此前的安装失败和路由状态未改变。
