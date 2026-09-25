import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname);

export default defineConfig({
  root,
  publicDir: false,
  build: {
    emptyOutDir: true,
    outDir: resolve(root, 'dist'),
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, 'webview/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
      cssFileName: 'main',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
