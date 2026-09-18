import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
const builderDir = path.dirname(require.resolve('app-builder-lib/package.json'));
const templatePath = path.join(builderDir, 'templates', 'nsis', 'portable.nsi');
const expectedBuilderVersion = '26.15.3';
const { version } = JSON.parse(await fs.readFile(path.join(builderDir, 'package.json'), 'utf8'));
if (version !== expectedBuilderVersion) throw new Error(`Review the native portable diagnostics before changing electron-builder ${version}. Expected ${expectedBuilderVersion}.`);

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Unexpected portable template: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}

// electron-builder 26 has no portable.script hook. Keep its compression, arguments,
// architecture checks and resources, and change only the native launch diagnostics.
// The installed template is restored after every build, including failed builds.
function instrumentPortable(original, diagnostics, launch) {
  let script = original.replace(/\r\n/g, '\n');
  script = replaceOnce(script, 'Function .onInit\n', diagnostics + 'Function .onInit\n  !insertmacro CollectorBootstrapLog "launcher-enter exe=$EXEPATH"\n  Banner::show /NOUNLOAD /set 76 "TOC Collector 程序已启动" "Loading application files..."\n');
  // A per-launch directory prevents a second launch from deleting a running app.
  script = replaceOnce(script, '  !ifdef UNPACK_DIR_NAME\n    StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"\n  !endif\n', '');
  script = replaceOnce(script, '  StrCpy $INSTDIR "$PLUGINSDIR\\app"\n', '  InitPluginsDir\n  StrCpy $INSTDIR "$PLUGINSDIR\\app"\n');
  script = replaceOnce(script, '  SetOutPath $INSTDIR\n', '  !insertmacro CollectorBootstrapLog "extract-before directory=$INSTDIR"\n  SetOutPath $INSTDIR\n');
  script = replaceOnce(script, '\tExecWait "$INSTDIR\\${APP_EXECUTABLE_FILENAME} $R0" $0\n  SetErrorLevel $0', launch);
  return script;
}

const requested = process.argv.slice(2);
if (!requested.length || requested.some(target => !['unpacked', 'nsis', 'portable', 'debug', '--check-template'].includes(target))) {
  throw new Error('Usage: node scripts/build-windows.mjs unpacked|nsis|portable|debug [unpacked|nsis|portable]');
}
// Unpacked and Setup builds do not depend on the portable launcher template.
const needsPortable = requested.some(target => ['portable', 'debug', '--check-template'].includes(target));
let original;
let instrumented;
if (needsPortable) {
  original = await fs.readFile(templatePath, 'utf8');
  const diagnostics = await fs.readFile(path.join(projectDir, 'build', 'portable-bootstrap.nsh'), 'utf8');
  const launch = await fs.readFile(path.join(projectDir, 'build', 'portable-launch.nsh'), 'utf8');
  instrumented = instrumentPortable(original, diagnostics + '\n', launch);
}
if (requested.includes('--check-template')) {
  console.log(`Native portable diagnostics verified against electron-builder ${version}.`);
} else {
  const { build, Platform, Arch } = require('electron-builder');
  // Prevent concurrent runs from seeing a temporarily instrumented vendor template.
  const lockPath = path.join(builderDir, '.toc-collector-build.lock');
  const lock = await fs.open(lockPath, 'wx');
  try {
    for (const target of requested) {
      const debug = target === 'debug';
      const actualTarget = debug ? 'portable' : target === 'unpacked' ? 'dir' : target;
      if (needsPortable) await fs.writeFile(templatePath, actualTarget === 'portable' ? instrumented : original);
      const config = debug ? {
        extraMetadata: { version: `${packageInfo.version}-debug`, main: 'src/minimal.mjs' },
        directories: { output: 'dist/debug' },
        portable: { artifactName: 'Organic-Synthesis-Gallery-TOC-Collector-Portable-${version}-${arch}.${ext}' },
      } : {};
      await build({ projectDir, targets: Platform.WINDOWS.createTarget(actualTarget, Arch.x64), config, publish: 'never' });
      if (target === 'unpacked') {
        const outputDir = path.join(projectDir, 'dist');
        const unpackedDir = path.join(outputDir, 'win-unpacked');
        await Promise.all([
          fs.access(path.join(unpackedDir, `${packageInfo.build.productName}.exe`)),
          fs.access(path.join(unpackedDir, 'Start-CollectorDiagnostics.ps1')),
          fs.access(path.join(unpackedDir, 'START-TOC-COLLECTOR.cmd')),
          fs.access(path.join(unpackedDir, 'Start-TOC-Collector-Unblock.ps1')),
          fs.access(path.join(unpackedDir, 'Start-TOC-Collector-Diagnostic.cmd')),
          fs.access(path.join(unpackedDir, 'Start-TOC-Collector-Diagnostic.ps1')),
        ]);
        const zipPath = path.join(outputDir, `Organic-Synthesis-Gallery-TOC-Collector-${packageInfo.version}-x64-win-unpacked.zip`);
        const temporaryZip = `${zipPath}.${process.pid}.tmp.zip`;
        // Reuse this pinned builder's archiver and retain the win-unpacked/ folder.
        const { archive } = require(path.join(builderDir, 'out', 'targets', 'archive.js'));
        try {
          await archive('zip', temporaryZip, unpackedDir, { withoutDir: false });
          await fs.rename(temporaryZip, zipPath);
        } finally {
          await fs.rm(temporaryZip, { force: true });
        }
        console.log(`Unpacked ZIP: ${zipPath}`);
      }
    }
  } finally {
    if (needsPortable) await fs.writeFile(templatePath, original);
    await lock.close();
    await fs.unlink(lockPath);
  }
}
