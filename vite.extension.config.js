import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './chrome-extension/manifest.json' with { type: 'json' };

export default defineConfig({
  root: 'chrome-extension',
  plugins: [crx({ manifest })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    modulePreload: false,
  },
});
