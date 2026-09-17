# Windows startup investigation — 0.1.4

Local validation: Windows 11 build 26200, x64, 2026-09-17 (UTC+08:00).

## Confirmed cause of the reported double-click failure

The downloaded 0.1.3 portable file has a Zone.Identifier stream with ZoneId=3. Launching that exact file through Explorer reproduced the missing-window symptom. Application Error event 1000 at **12:08:32.5246486** records a crash in **CHXSmartScreen.exe**, module **edgehtml.dll**, exception **0x8000ffff**, offset **0x20679d**. The same crash signature exists at 11:51:11, 11:51:31 and 11:52:01, corresponding to the earlier attempts. Report ID for the reproduced failure: `ece657f2-7f7a-4314-9f55-e15778240851`.

This failing launch path is in the Windows application reputation UI, before Collector's JavaScript can write a log. It is not an Electron main-process crash. No matching Collector/electron.exe Application Error or WER report was found in the preceding 14 days.

Control runs of the **same unchanged 0.1.3 executable**, using PowerShell/.NET process creation, with and without `--enable-logging --v=1`, both produced a visible dashboard and Electron main, GPU, network utility and renderer processes. They remained alive throughout observation. The portable wrapper's captured stdout and stderr were both empty; empty streams did not indicate a crash. The diagnostic rerun's wrapper returned exit code 0 after the closing/cleanup sequence. No spontaneous startup exit was observed in these direct-process runs.

Original file SHA-256: `1DD4CCA34B67B5CEC1DCD7281239B01AAE68C5AABEE2FEFB5D2CE4505073A2C9`.

**Boundary:** this app release does not repair the Windows SmartScreen/edgehtml component. A future browser download may still invoke that faulty OS component. Windows security settings and download markers were not changed. The deliverables used for local validation were built locally from the inspected source.

## Entry, package and process checks

- Original asar contains `src/main.mjs`, package main is `src/main.mjs`, and type is `module`.
- Original source development runtime displayed its dashboard with Electron 37.10.3. The initial local npm dependency installation had an incomplete Electron extraction; the official cached archive was extracted successfully before rerunning development mode. This was a setup issue encountered during diagnosis, not the downloaded EXE's cause.
- Both original development and packaged main entry ran, ruling out the proposed ESM/module-resolution/asar omission cause for the reproduced failure.
- New asar contains `src/main.mjs`, `src/background.mjs`, and `src/minimal.mjs`. No runtime third-party modules are required.
- Collector userData is `%APPDATA%\organic-synthesis-gallery-toc-collector`. There were no historical Collector files before the successful diagnostic launches. New launches produced `collector.log`, `config.json`, and `state.json`.
- Corrected distinct Setup and Portable artifact names remove a real output collision, but that collision was not established as the cause of the Explorer failure.

## Changes

The main entry synchronously writes `%TEMP%\toc-collector-bootstrap.log` before dynamically importing Electron. It registers error handlers, creates a visible window on ready, loads the startup-success page, then imports the background module. Do not top-level-await `app.whenReady()` in an ESM entry: waiting for readiness before the entry finishes evaluation can leave a windowless process. The ready callback is registered with `.then()`.

Background initialization is isolated in the order logging → config → tray → network → API → collector. Each stage logs begin/success/failure. Failures are visible in the dashboard. A valid bitmap replaces the SVG tray icon. Configuration initialization no longer changes Windows login settings; login startup is opt-in. The portable login path uses the stable outer EXE rather than its temporary extraction path. Collection waits for a write token.

The native Portable launcher writes diagnostics before extraction/Electron execution, shows a launch banner, quotes the executable path, uses a unique extraction directory per invocation, and reports child startup failures/nonzero exits. The PowerShell diagnostic launcher likewise runs before Electron and captures streams, process creation and exit status. Neither layer can execute if Windows prevents creation of the launcher itself; check Application Error events in that case.

## Actual local tests

| Test | Observed result |
| --- | --- |
| Original 0.1.3 direct process, plain/logging flags | Visible dashboard, main/GPU/utility/renderer alive |
| Original 0.1.3 Explorer double-click | CHXSmartScreen crash in edgehtml.dll; no Collector startup |
| Minimal development entry | Visible `TOC Collector 0.1.4 started successfully` |
| 0.1.4-debug Portable EXE | Same visible minimal page; native launcher exit 0 on normal close |
| Window-only stage | Window observed at 303 ms |
| Logging stage | Window observed at 343 ms; stage completed |
| Config stage | Window observed at 338 ms; config/state persisted |
| Tray stage | Window observed at 328 ms; icon nonempty, stage completed |
| Network stage | Window observed at 241 ms; probes completed, publishers unavailable |
| API stage | Window observed at 240 ms; real 30-second timeout displayed; window remained alive |
| Collector stage | Window observed at 347 ms; initialization completed with API error and waiting-for-token status |
| Injected tray failure | Window observed at 268 ms; failure logged and visible; process alive |
| NSIS installer | Installed successfully, exit 0 |
| Installed 0.1.4 EXE | Main window observed within 0.5 seconds with child processes; API timeout did not close it |
| Final 0.1.4 Portable, actual Explorer double-click | Visible dashboard inspected; all initialization stages completed by 12:25:53, with API timeout displayed and process still alive |

Final local Portable SHA-256: `A0DD1AB90725C946D1F39D4C28566B7D80584D46CAC3FD89B689F69B09B11378`.
Final local Setup SHA-256: `E7AAF63BD83ABE14B43FF29461C12D34DFB1310CE386870F7345165B63781190`.

These are startup tests, not a claim that publisher access, authentication or TOC uploads were successful. No write token was configured and no TOC upload was performed.

See [README](README.md) for native diagnostics and incremental startup commands. Electron's [ESM documentation](https://www.electronjs.org/docs/latest/tutorial/esm) describes main-process module loading; electron-builder's [NSIS documentation](https://www.electron.build/v26/docs/nsis/) describes the separate targets.
