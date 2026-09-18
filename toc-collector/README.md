# Organic Synthesis Gallery TOC Collector

Windows 10/11 托盘常驻程序，用用户本机网络/VPN 补齐出版社 TOC / graphical abstract，并继续使用现有 Gallery Cloudflare 媒体 API 与永久缓存。

## 行为

- 手动运行立即显示“程序已启动”，然后逐项加载后台功能；后台失败显示在面板上，窗口继续保留。
- 开机自动启动默认关闭，可在托盘菜单中主动开启；初始化配置不修改 Windows 登录启动设置。
- 默认每 10 分钟从 `https://api.gczhouwld.com/api/media/bridge-queue` 读取队列；主域名发生 DNS、TLS、超时或 5xx 错误时自动尝试 Worker 原始地址。
- Nature / Science / 其他当前可直接访问来源先静默处理。
- ACS (`10.1021/*`) 与 Wiley/Angew (`10.1002/*`) 先检测网络；已可访问时自动工作。
- 只有存在受限 backlog 且当前网络不可访问时才提醒。
- 默认按钮：立即处理 / 6小时后提醒 / 今天不再提醒 / 更多选项。
- “今天不再提醒”只关闭通知，后台每 30 秒仍监听 ACS/Wiley 是否恢复可访问；一旦可访问会自动处理。
- 403/429/timeout/未发现语义 TOC 分级退避，避免连续撞出版社。
- 官方主图识别包括 `Abstract Image`、Graphical Abstract、Visual Abstract、TOC Graphic、Table of Contents。
- 没有官方主图时允许上传 Figure 1 作为 fallback；网站仍能区分真正 TOC 与 Figure 1 fallback。
- 抓取完成只发静默 Windows 通知，不弹“完成”窗口。
- Tampermonkey VPN Bridge 继续保留为备用通道。

## 首次运行

1. 安装 GitHub Actions 生成的 Windows 安装包，或在此目录运行 `npm install && npm start`。
2. 首次启动会创建：`%APPDATA%/organic-synthesis-gallery-toc-collector/config.json`（具体目录以 Electron `userData` 为准）。
3. 托盘菜单选择“打开设置文件”。
4. 将 `writeToken` 设置为当前 Gallery 的 `BRIDGE_WRITE_TOKEN`。这是上传 TOC/Figure 到现有 Cloudflare API 所必需的；值只保存在本机配置文件。
5. 如果希望“立即处理”时帮你打开 VPN 软件，把 `vpnExecutable` 设置为 VPN 程序 exe 的完整路径。Collector 不依赖某个特定 VPN 品牌。
6. 保存配置。下一轮检查会自动读取新配置，无需重启。

示例：

```json
{
  "apiBase": "https://api.gczhouwld.com",
  "apiFallbackBase": "https://organic-synthesis-gallery.zhou526316.workers.dev",
  "writeToken": "YOUR_BRIDGE_WRITE_TOKEN",
  "vpnExecutable": "C:\\Program Files\\YourVPN\\vpn.exe",
  "autoStart": false,
  "pollMinutes": 10,
  "reminderHours": 6,
  "minRestrictedBacklog": 1,
  "maxPerCycle": 12,
  "publisherTimeoutSeconds": 35,
  "headlessWaitMs": 5000
}
```

## 托盘菜单

- 现在检查一次
- 查看当前队列
- 打开设置文件
- 查看日志
- 今天不再提醒
- 开机自动运行
- 退出

“更多选项”提供暂停提醒 3 天 / 7 天，以及直接打开设置和日志。

## 数据与日志

Collector 不保存出版社文章全文。只在本地短暂载入页面，提取 TOC/graphical abstract/Figure 1 候选并把合规图片上传到现有 R2 缓存。

本地仅持久化：

- `config.json`：本机设置和写入密钥；
- `state.json`：提醒、冷却和最近运行摘要；
- `collector.log`：运行日志。

## 构建

```powershell
cd toc-collector
npm install
npm run check
npm run dist:win
```

0.1.6 固定 Electron 37.10.3 / electron-builder 26.15.3，避免同一源码因依赖升级生成不同运行时。优先构建 `win-unpacked` ZIP，再顺序构建两个安装 target；所有产物使用不同文件名：

- `dist/Organic-Synthesis-Gallery-TOC-Collector-0.1.6-x64-win-unpacked.zip`：优先发布的完整解压目录。
- `dist/Organic-Synthesis-Gallery-TOC-Collector-Setup-0.1.6-x64.exe`：NSIS 安装程序。
- `dist/Organic-Synthesis-Gallery-TOC-Collector-Portable-0.1.6-x64.exe`：免安装程序。

也可以用 `npm run dist:unpacked`、`npm run dist:nsis` 和 `npm run dist:portable` 单独构建。`npm run dist:debug` 生成 `dist/debug/Organic-Synthesis-Gallery-TOC-Collector-Portable-0.1.6-debug-x64.exe`，入口为 `src/minimal.mjs`，仅用于确认窗口能够启动。

免安装启动器在 Electron 启动前，将入口、解压、启动及子进程退出码写入 `%TEMP%\toc-collector-bootstrap.log`。解压后缺少 EXE、Windows 创建进程失败或子进程异常退出时显示原生错误框。每次启动使用独立的临时解压目录；子程序路径显式加引号。electron-builder 26 没有 portable 自定义脚本选项，因此 `scripts/build-windows.mjs` 只在构建期间为固定版本的原生模板增加 `build/portable-*.nsh`，并在结束或失败后恢复模板；请使用上述 npm 构建命令。

`npm start` 使用 PowerShell 原生诊断启动器，先写日志再启动 Electron，转发后续应用参数，并记录独立的 stdout、stderr 文件、进程 ID、窗口和退出码。它仅为子进程移除会把 Electron 变成 Node 的 `ELECTRON_RUN_AS_NODE` 环境变量。安装/解压后的目录也包含 `Start-CollectorDiagnostics.ps1`：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-CollectorDiagnostics.ps1
# 指定任意已安装或解压的 EXE，并打开 Chromium 日志：
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-CollectorDiagnostics.ps1 -ExecutablePath 'C:\path\Organic Synthesis Gallery TOC Collector.exe' --enable-logging --v=1
```

这个脚本无需 Electron、asar 或 `app.getPath()` 即可记录启动过程。JavaScript 日志只能在 Electron 已进入 JS 后执行，不能替代原生启动记录。

## 当前边界

0.1.6 优先保证启动可见、启动诊断完整。无 writeToken 时仍可读取队列和执行显式的只读发布商诊断，但不会上传。API 或出版社不可达时面板显示错误，主窗口继续运行。特殊 CAPTCHA、必须登录的页面仍需人工处理。PMC 继续沿用仓库已有的 GitHub Pages 开放媒体管道，不重复抓取。

## 分阶段启动排障

```powershell
npm start -- --startup-stage=window
npm start -- --startup-stage=logging
npm start -- --startup-stage=config
npm start -- --startup-stage=tray
npm start -- --startup-stage=network
npm start -- --startup-stage=api
npm start -- --startup-stage=collector
npm start -- --startup-stage=tray --fail-stage=tray
```

每次启动只加载至指定阶段。最后一条用于验证托盘初始化失败仍保留主窗口。可将这些参数直接传给安装后的 EXE。启动日志为 `%TEMP%\toc-collector-bootstrap.log`；开发诊断脚本同时保存 `%TEMP%\toc-collector-stdout-<PID>.log` 和 `toc-collector-stderr-<PID>.log`。

本机 0.1.3 无窗口问题的复现、Windows SmartScreen 崩溃证据与 0.1.4 运行结果见 [STARTUP-DIAGNOSIS.md](STARTUP-DIAGNOSIS.md)。
