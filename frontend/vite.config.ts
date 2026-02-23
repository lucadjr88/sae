/*import { defineConfig } from 'vite';
/*import path from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist', // frontend/dist
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
});*/

import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react'; // Assicurati che sia importato
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  root: '.',
  // Aggiungi i plugin per React e SSL
  plugins: [
    react(),
    basicSsl(), // Crea il contesto sicuro HTTPS necessario
  ],
  server: {
    hmr: {
      protocol: 'wss', // Forza il websocket di Vite a essere sicuro
    },
  },


  build: {
    outDir: 'dist',
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
