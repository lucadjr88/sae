

import { defineConfig } from 'vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'pages/privacy_policy': path.resolve(__dirname, 'pages/privacy_policy.html'),
        'pages/instructions': path.resolve(__dirname, 'pages/instructions.html'),
      },
    },
  },
  plugins: [
    // viteStaticCopy può essere lasciato vuoto o rimosso se non serve per altri asset
  ]
});
