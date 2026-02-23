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
    basicSsl() // Questo genera il certificato HTTPS locale necessario per il mobile
  ],
  server: {
    https: true, // Forza HTTPS
    hmr: {
      protocol: 'wss', // Forza il WebSocket sicuro per evitare blocchi CSP
    },
    proxy: {
      // Se il tuo wallet cerca di parlare con un RPC locale o bridge
      '/solana-wallet': {
        target: 'ws://localhost:54490',
        ws: true,
      },
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
