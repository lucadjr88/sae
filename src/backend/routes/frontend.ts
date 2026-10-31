// Serve static frontend files from /frontend

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';


const router = express.Router();

// Fix __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import fs from 'fs';

// Serve frontend: use dist/ if available, fallback to frontend/
const distPath = path.join(process.cwd(), 'dist');
const frontendPath = fs.existsSync(path.join(distPath, 'index.html'))
  ? distPath
  : path.join(process.cwd(), 'frontend');

// Aggiungi header CSP permissivo per SPA
router.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: ws: wss: blob: staratlasexplorer.it:*; frame-src 'self' https://connect.solflare.com https://solana-mobile.github.io;");
  next();
});
router.use('/', express.static(frontendPath));

// Fallback: serve index.html for all unmatched routes (SPA support)
router.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

export default router;
