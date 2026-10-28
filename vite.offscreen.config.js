import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'chrome-extension',
    emptyOutDir: false,
    rollupOptions: {
      input: 'chrome-extension/offscreen/offscreen-src.js',
      output: {
        entryFileNames: 'offscreen/offscreen.js',
        chunkFileNames: 'offscreen/[name].js',
        assetFileNames: 'offscreen/[name][extname]',
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
});
