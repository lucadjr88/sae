// Serve static frontend files from /frontend

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';


const router = express.Router();

// Fix __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Serve frontend: use dist/ in production, src/ in development
const isDev = process.argv.includes('tsx');
const frontendPath = isDev
  ? path.join(__dirname, '../../../frontend/src')
  : path.join(__dirname, '../../../frontend/dist');

// Aggiungi header CSP permissivo per SPA
router.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:;");
  next();
});
router.use('/', express.static(frontendPath));

// Fallback: serve index.html for all unmatched routes (SPA support)
router.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

export default router;
