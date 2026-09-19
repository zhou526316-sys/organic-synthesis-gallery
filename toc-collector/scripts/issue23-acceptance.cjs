// Explicit staged, read-only publisher acceptance. Never starts queue processing.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const stage = process.argv.find(arg => arg.startsWith('--phase='))?.split('=')[1] || 'nature';
if (!['nature', 'restricted'].includes(stage)) throw new Error('Unsupported phase');
app.setPath('userData', path.join(app.getPath('appData'), 'organic-synthesis-gallery-toc-collector'));
const output = path.resolve('.artifacts');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, `issue23-${stage}-launch.json`), JSON.stringify({ pid: process.pid, stage, status: 'js_entry', at: new Date().toISOString() }));
let bg;
let checkpoint = 'app_ready';
app.whenReady().then(async () => {
  checkpoint = 'window_create';
  const window = new BrowserWindow({ show: true, width: 880, height: 850,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.resolve('toc-collector/src/preload.cjs') } });
  checkpoint = 'background_import';
  const { initializeBackground } = await import(pathToFileURL(path.resolve('toc-collector/src/background.mjs')).href);
  checkpoint = 'background_initialize';
  bg = await initializeBackground({ window, stage: 'config' });
  checkpoint = 'publisher_acceptance';
  const results = [];
  const dois = stage === 'nature'
    ? ['10.1038/s41467-026-76235-7', '10.1038/s44160-026-01158-6']
    : ['10.1021/acs.orglett.6c03622', '10.1002/anie.1537547'];
  for (const doi of dois) {
    if (bg.pendingManualHandoff()) {
      await bg.getPendingManualHandoff();
      results.push({ doi, status: 'paused_existing_manual_session' }); break;
    }
    try {
      const inspected = stage === 'nature' ? await bg.inspectArticle(doi)
        : await bg.inspectArticleBrowserbase(doi, doi.startsWith('10.1021/')
          ? `https://pubs.acs.org/doi/${doi}` : `https://onlinelibrary.wiley.com/doi/${doi}`, 'issue23', { verifyImage: true });
      const c = inspected?.candidate;
      const data = c?.imageData || inspected?.image?.imageData;
      if (data) fs.writeFileSync(path.join(output, doi.replaceAll('/', '_') + '.png'), Buffer.from(data.split(',')[1], 'base64'));
      results.push({ doi, status: c ? 'candidate_verified' : 'unresolved', kind: c?.kind,
        source: c?.source || inspected?.method, confidence: c?.confidence,
        ownershipEvidence: c?.ownershipToken || c?.src, imageReadable: Boolean(data),
        width: c?.width, height: c?.height });
    } catch (error) {
      results.push({ doi, status: /manual_required/.test(error.message) ? 'manual_required' : 'failed' });
    }
    fs.writeFileSync(path.join(output, `issue23-${stage}.json`), JSON.stringify(results, null, 2));
    if (bg.pendingManualHandoff()) break;
  }
  fs.writeFileSync(path.join(output, `issue23-${stage}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  // Manual sessions and their browser connections stay alive for the user.
  if (!bg.pendingManualHandoff()) { bg.dispose(); window.destroy(); app.exit(0); }
}).catch(error => {
  fs.writeFileSync(path.join(output, `issue23-${stage}-error.json`), JSON.stringify({ checkpoint,
    category: /expired/.test(error.message) ? 'original_session_expired' : /401|403/.test(error.message) ? 'authorization_failed' : /missing/.test(error.message) ? 'missing_resource_or_config' : 'initialization_failed',
    code: error.code || null, name: error.name }));
  console.error('Acceptance failed; inspect safe stage report'); app.exit(1);
});
