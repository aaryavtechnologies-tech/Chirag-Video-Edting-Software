import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: { build: { lib: { entry: 'electron/main.ts', formats: ['cjs'] } } },
  preload: { build: { lib: { entry: 'electron/preload.ts', formats: ['cjs'] } } },
  renderer: {
    root: '.',
    plugins: [react()],
    build: { rollupOptions: { input: resolve('index.html') } },
  },
});
