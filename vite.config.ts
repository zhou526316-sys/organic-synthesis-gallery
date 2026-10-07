import { defineConfig } from 'vite';
import { pdfVaultAssets } from './scripts/pdf-vault-assets.mjs';

const galleryBuildId = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || Date.now().toString(36)).slice(0, 12);

export default defineConfig({
  plugins: [pdfVaultAssets()],
  define: {
    __GALLERY_BUILD_ID__: JSON.stringify(galleryBuildId),
  },
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      input: {
        gallery: 'index.html',
        ownerPdf: 'pdf/index.html',
        pdfVault: 'pdf-vault/index.html',
      },
      maxParallelFileOps: 128,
    },
  },
});
