from pathlib import Path
import json

MAIN = Path('toc-collector/src/main.mjs')
PACKAGE = Path('toc-collector/package.json')

s = MAIN.read_text(encoding='utf-8')

old_lock = (
    "const gotLock = app.requestSingleInstanceLock();\n"
    "if (!gotLock) app.quit();\n"
    "app.on('second-instance', () => showDashboard());\n"
)
if old_lock in s:
    s = s.replace(
        old_lock,
        "// Safe-start 0.1.3: never silently quit before the UI can report a startup problem.\n"
        "// Background duplicate protection will be reintroduced only after startup is proven stable.\n",
        1,
    )

s = s.replace(
    "    minHeight: 480,\n    show: false,\n    autoHideMenuBar: true,\n    title: 'TOC Collector',",
    "    minHeight: 480,\n    show: true,\n    autoHideMenuBar: true,\n    title: 'TOC Collector',",
    1,
)

s = s.replace(
    "  refreshDashboard();\n  dashboard.once('ready-to-show', () => { dashboard?.show(); dashboard?.focus(); });\n}",
    "  refreshDashboard();\n  dashboard.show();\n  dashboard.focus();\n}",
    1,
)

old_start = "\n".join([
    "app.whenReady().then(async () => {",
    "  await ensureConfig();",
    "  tray = new Tray(trayIcon());",
    "  tray.setToolTip('Organic Synthesis Gallery TOC Collector');",
    "  tray.on('click', () => showDashboard());",
    "  tray.on('double-click', () => showDashboard());",
    "  rebuildTrayMenu();",
    "  if (!process.argv.includes('--background')) showDashboard();",
    "  await log('collector started', { version: app.getVersion(), configPath: configPath() });",
    "  setTimeout(() => void runCycle(false), 2500);",
    "  pollTimer = setInterval(() => void runCycle(false), Math.max(3, Number(config.pollMinutes)||10) * 60 * 1000);",
    "});",
    "",
    "app.on('window-all-closed', event => event.preventDefault?.());",
])

new_start = "\n".join([
    "app.whenReady().then(async () => {",
    "  await ensureConfig();",
    "",
    "  // Manual launch: make the dashboard visible before tray/network initialization.",
    "  if (!process.argv.includes('--background')) showDashboard();",
    "",
    "  try {",
    "    tray = new Tray(trayIcon());",
    "    tray.setToolTip('Organic Synthesis Gallery TOC Collector');",
    "    tray.on('click', () => showDashboard());",
    "    tray.on('double-click', () => showDashboard());",
    "    rebuildTrayMenu();",
    "  } catch (error) {",
    "    await log('tray init failed', String(error?.stack || error));",
    "  }",
    "",
    "  await log('collector started', {",
    "    version: app.getVersion(),",
    "    configPath: configPath(),",
    "    background: process.argv.includes('--background'),",
    "  });",
    "  setTimeout(() => void runCycle(false), 2500);",
    "  pollTimer = setInterval(() => void runCycle(false), Math.max(3, Number(config.pollMinutes)||10) * 60 * 1000);",
    "}).catch(async error => {",
    "  const detail = String(error?.stack || error);",
    "  console.error(error);",
    "  try { await log('startup failed', detail); } catch {}",
    "  try { dialog.showErrorBox('TOC Collector 启动失败', detail); } catch {}",
    "});",
    "",
    "app.on('window-all-closed', () => {});",
])

if old_start in s:
    s = s.replace(old_start, new_start, 1)
elif "tray init failed" not in s:
    raise SystemExit('startup anchor not found and safe-start patch is absent')

fatal_marker = "// Fatal-error visibility 0.1.3"
if fatal_marker not in s:
    anchor = "app.whenReady().then(async () => {"
    if anchor not in s:
        raise SystemExit('whenReady anchor not found')
    handlers = "\n".join([
        fatal_marker,
        "process.on('uncaughtException', error => {",
        "  const detail = String(error?.stack || error);",
        "  console.error(error);",
        "  void log('uncaught exception', detail);",
        "  try { dialog.showErrorBox('TOC Collector 运行错误', detail); } catch {}",
        "});",
        "process.on('unhandledRejection', error => {",
        "  const detail = String(error?.stack || error);",
        "  console.error(error);",
        "  void log('unhandled rejection', detail);",
        "  try { dialog.showErrorBox('TOC Collector 运行错误', detail); } catch {}",
        "});",
        "",
        "",
    ])
    s = s.replace(anchor, handlers + anchor, 1)

if "Safe-start 0.1.3" not in s:
    raise SystemExit('safe-start marker missing after patch')
if "Fatal-error visibility 0.1.3" not in s:
    raise SystemExit('fatal-error marker missing after patch')

MAIN.write_text(s, encoding='utf-8')

package = json.loads(PACKAGE.read_text(encoding='utf-8'))
package['version'] = '0.1.3'
PACKAGE.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('TOC Collector safe-start patch 0.1.3 applied')
