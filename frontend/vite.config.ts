import { defineConfig } from 'vite';
import path from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    {
      name: 'copy-ui-styles',
      closeBundle() {
        const srcDir = path.resolve(__dirname, 'src/ui/styles');
        const destDir = path.resolve(__dirname, '../dist/ui/styles');
        mkdirSync(destDir, { recursive: true });
        const files = readdirSync(srcDir);
        files.forEach((file: string) => {
          if (file.endsWith('.css')) {
            copyFileSync(path.join(srcDir, file), path.join(destDir, file));
          }
        });
      },
    },
    {
      name: 'copy-pages-images',
      closeBundle() {
        const srcDir = path.resolve(__dirname, 'public/pages');
        const destDir = path.resolve(__dirname, '../dist/assets');
        try {
          mkdirSync(destDir, { recursive: true });
          const files = readdirSync(srcDir);
          files.forEach((file: string) => {
            if (file.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
              copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            }
          });
        } catch (err) {
          // Directory might not exist yet, that's fine
        }
      },
    },
  ],
});
