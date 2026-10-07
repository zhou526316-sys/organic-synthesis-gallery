import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';

// Ship PDF.js support data on Gallery's own origin. A local document never
// depends on a third-party viewer, CDN, font service, or document upload.
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
const prefix = `pdf-vault-assets/${version}/`;

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : entry.isFile() ? [file] : [];
  });
}

export function pdfVaultAssets() {
  const files = ['cmaps', 'standard_fonts', 'wasm', 'iccs'].flatMap(name => filesIn(join(packageRoot, name)));
  files.push(join(packageRoot, 'LICENSE'));
  const assets = new Map(files.map(file => [prefix + relative(packageRoot, file).replaceAll('\\', '/'), file]));
  return {
    name: 'gallery-local-pdf-assets',
    generateBundle() {
      for (const [fileName, file] of assets) this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname.slice(1);
        const file = assets.get(pathname);
        if (!file) return next();
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        response.end(readFileSync(file));
      });
    },
  };
}
