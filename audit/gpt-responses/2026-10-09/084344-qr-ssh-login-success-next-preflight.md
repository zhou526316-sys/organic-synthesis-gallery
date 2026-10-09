# Tencent SSH QR sign-in succeeded — preflight continuation

Beijing time: 2026-10-09T08:43:44.730+08:00
User: “我能正常进去”.

## Complete user-visible answer

那说明**腾讯云的 SSH 扫码身份验证正常**，不用再排查登录问题。

现在继续使用原来的 **Windows PowerShell 预检窗口**。扫码确认后，脚本会自动创建临时目录、上传检查文件，再执行服务器预检；由于它会发起多次 SSH/SCP 连接，中途可能再次要求扫码。**只有出现 `[CHECK]` 检查结果，并显示 `Finished mode: Preflight`，才代表预检完成。** 能进入 `ubuntu@VM-0-11-ubuntu:~$` 只说明登录成功，不能代替预检结果。

如果你已经在 Ubuntu 的交互式命令行，输入 `exit` 返回 `PS C:\Users\asus>`，然后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dst -Mode Preflight -SshUser ubuntu
```

**先不要执行 `-Mode Install`。** 把预检完成后的 `[CHECK]`、`[PENDING]` 或 `[STOP]` 输出发我，我会判断 DNS、HTTPS 证书和 Nginx 是否具备安全部署条件。

## Scope
Only guided user through preflight; no server, DNS, payment, repository code, or website production modifications. The PowerShell 5.1 repaired script remains the existing launcher; do not mistake successful SSH for safe deployment.
