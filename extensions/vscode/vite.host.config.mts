import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname);

export default defineConfig({
  root,
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: resolve(root, 'dist'),
    lib: {
      entry: resolve(root, 'host/validator.ts'),
      formats: ['cjs'],
      fileName: () => 'validator.cjs',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
