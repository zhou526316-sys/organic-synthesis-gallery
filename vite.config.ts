import { defineConfig } from 'vite';

const galleryBuildId = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || Date.now().toString(36)).slice(0, 12);

export default defineConfig({
  define: {
    __GALLERY_BUILD_ID__: JSON.stringify(galleryBuildId),
  },
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
    },
  },
});
