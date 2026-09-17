# Organic Synthesis Gallery TOC Collector

Windows 10/11 托盘常驻程序，用用户本机网络/VPN 补齐出版社 TOC / graphical abstract，并继续使用现有 Gallery Cloudflare 媒体 API 与永久缓存。

## 行为

- 登录 Windows 后自动启动（默认开启）。
- 默认每 10 分钟检查一次 `/api/media/bridge-queue`。
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
  "apiBase": "https://organic-synthesis-gallery-public.pages.dev",
  "writeToken": "YOUR_BRIDGE_WRITE_TOKEN",
  "vpnExecutable": "C:\\Program Files\\YourVPN\\vpn.exe",
  "autoStart": true,
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

生成的 NSIS 安装包位于 `toc-collector/dist/`。

## 当前边界

0.1.0 是第一版 Collector。它优先解决当前最大问题：利用用户本机 VPN/IP 环境访问 ACS/Wiley/Nature 并自动上传媒体。特殊 CAPTCHA、必须登录、必须视觉点击的页面不会尝试 Computer Use；这些任务保留给 Tampermonkey Bridge 或后续人工异常队列。PMC 继续沿用仓库已有的 GitHub Pages 开放媒体管道，不重复抓取。
