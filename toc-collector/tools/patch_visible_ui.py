from pathlib import Path
import json

p = Path('toc-collector/src/main.mjs')
s = p.read_text(encoding='utf-8')

if "let dashboard = null;" not in s:
    s = s.replace(
        "let tray = null;\nlet cycleRunning = false;",
        "let tray = null;\nlet dashboard = null;\nlet quitting = false;\nlet cycleRunning = false;"
    )

s = s.replace(
    "app.on('second-instance', () => tray?.popUpContextMenu());",
    "app.on('second-instance', () => showDashboard());"
)
s = s.replace(
    "app.setLoginItemSettings({ openAtLogin: Boolean(config.autoStart), path: process.execPath });",
    "app.setLoginItemSettings({ openAtLogin: Boolean(config.autoStart), path: process.execPath, args: ['--background'] });"
)

marker = "function trayIcon() {"
if marker not in s:
    raise SystemExit('trayIcon marker missing')

if "function showDashboard()" not in s:
    dashboard_code = r'''
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function dashboardHtml() {
  const summary = state.lastSummary || {};
  const net = summary.net || {};
  const restricted = lastQueue.filter(x => ['acs','wiley'].includes(classify(x.doi))).length;
  const rows = lastQueue.slice(0, 12).map(x => `<tr><td>${escapeHtml(x.doi)}</td><td>${escapeHtml(classify(x.doi).toUpperCase())}</td></tr>`).join('');
  const tokenState = config.writeToken ? '已配置' : '未配置（只能检查，不能上传）';
  const vpnState = config.vpnExecutable ? escapeHtml(config.vpnExecutable) : '未设置；仍会自动检测现有 VPN';
  return `<!doctype html><html><head><meta charset="utf-8"><title>TOC Collector</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f6f7f9;color:#202124}.wrap{max-width:720px;margin:auto;padding:24px}
    h1{font-size:23px;margin:0 0 6px}.sub{color:#666;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}
    .card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px}.k{font-size:12px;color:#777}.v{font-size:19px;margin-top:4px}
    .ok{color:#188038}.bad{color:#b3261e}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.buttons a{background:#fff;border:1px solid #bbb;border-radius:8px;padding:9px 13px;text-decoration:none;color:#202124}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
    .note{font-size:12px;color:#666;margin-top:12px;line-height:1.5}
  </style></head><body><div class="wrap"><h1>Organic Synthesis Gallery · TOC Collector</h1><div class="sub">程序正在后台运行。关闭此窗口不会退出 Collector。</div>
  <div class="grid">
    <div class="card"><div class="k">当前队列</div><div class="v">${lastQueue.length}</div></div>
    <div class="card"><div class="k">ACS / Wiley 待处理</div><div class="v">${restricted}</div></div>
    <div class="card"><div class="k">ACS 网络</div><div class="v ${net.acs ? 'ok':'bad'}">${net.acs === true ? '可访问' : net.acs === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">Wiley 网络</div><div class="v ${net.wiley ? 'ok':'bad'}">${net.wiley === true ? '可访问' : net.wiley === false ? '不可访问' : '待检测'}</div></div>
    <div class="card"><div class="k">写入密钥</div><div class="v" style="font-size:14px">${escapeHtml(tokenState)}</div></div>
    <div class="card"><div class="k">上次处理</div><div class="v" style="font-size:14px">成功 ${Number(summary.success||0)} · 失败 ${Number(summary.failed||0)}</div></div>
  </div>
  <div class="buttons"><a href="collector:check">现在检查一次</a><a href="collector:config">打开设置</a><a href="collector:log">查看日志</a><a href="collector:hide">隐藏到托盘</a></div>
  <table><thead><tr><th>最近待处理 DOI</th><th>来源</th></tr></thead><tbody>${rows || '<tr><td colspan="2">当前无待处理项目</td></tr>'}</tbody></table>
  <div class="note">VPN 程序：${vpnState}<br>自动检查间隔：${Number(config.pollMinutes||10)} 分钟；提醒间隔：${Number(config.reminderHours||6)} 小时。</div>
  </div></body></html>`;
}

function refreshDashboard() {
  if (!dashboard || dashboard.isDestroyed()) return;
  dashboard.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dashboardHtml())}`).catch(() => {});
}

function showDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    refreshDashboard();
    dashboard.show();
    dashboard.focus();
    return;
  }
  dashboard = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 560,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'TOC Collector',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  dashboard.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      dashboard.hide();
    }
  });
  dashboard.on('closed', () => { dashboard = null; });
  dashboard.webContents.on('will-navigate', async (event, url) => {
    if (!url.startsWith('collector:')) return;
    event.preventDefault();
    const action = url.slice('collector:'.length);
    if (action === 'check') void runCycle(true);
    if (action === 'config') await shell.openPath(configPath());
    if (action === 'log') await shell.openPath(logPath());
    if (action === 'hide') dashboard?.hide();
  });
  refreshDashboard();
  dashboard.once('ready-to-show', () => { dashboard?.show(); dashboard?.focus(); });
}

'''
    s = s.replace(marker, dashboard_code + marker)

s = s.replace(
    "  tray.setContextMenu(Menu.buildFromTemplate([\n    { label: `TOC Collector · ${status}`, enabled: false },",
    "  tray.setContextMenu(Menu.buildFromTemplate([\n    { label: `TOC Collector · ${status}`, enabled: false },\n    { label: '打开状态面板', click: () => showDashboard() },"
)
s = s.replace(
    "app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });",
    "app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: ['--background'] });"
)
s = s.replace(
    "  tray.setToolTip('Organic Synthesis Gallery TOC Collector');\n  rebuildTrayMenu();",
    "  tray.setToolTip('Organic Synthesis Gallery TOC Collector');\n  tray.on('click', () => showDashboard());\n  tray.on('double-click', () => showDashboard());\n  rebuildTrayMenu();\n  if (!process.argv.includes('--background')) showDashboard();"
)
s = s.replace(
    "    rebuildTrayMenu();\n  } catch (error) {",
    "    rebuildTrayMenu();\n    refreshDashboard();\n  } catch (error) {"
)
s = s.replace(
    "app.on('before-quit', () => { if (pollTimer)",
    "app.on('before-quit', () => { quitting = true; if (pollTimer)"
)

p.write_text(s, encoding='utf-8')

pkg = Path('toc-collector/package.json')
data = json.loads(pkg.read_text(encoding='utf-8'))
data['version'] = '0.1.1'
pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
