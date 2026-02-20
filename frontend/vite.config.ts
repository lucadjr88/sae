import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
});
