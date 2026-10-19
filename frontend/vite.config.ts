

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
        'pages/terms': path.resolve(__dirname, 'pages/terms.html'),
        'pages/sea': path.resolve(__dirname, 'pages/sea.html'),
        'pages/info': path.resolve(__dirname, 'pages/info_sea.html'),
        'pages/about_sea': path.resolve(__dirname, 'pages/text/about_sea.html'),
        'pages/privacy_sea': path.resolve(__dirname, 'pages/text/privacy_sea.html'),
        'pages/terms_sea': path.resolve(__dirname, 'pages/text/terms_sea.html'),
        'pages/credits_sea': path.resolve(__dirname, 'pages/text/credits_sea.html'),
        'pages/contact_sea': path.resolve(__dirname, 'pages/text/contact_sea.html'),
      },
    },
  },
  plugins: [
    // viteStaticCopy può essere lasciato vuoto o rimosso se non serve per altri asset
  ]
});
