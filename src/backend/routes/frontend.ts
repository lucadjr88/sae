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
const frontendDir = isDev ? 'src' : 'dist';
router.use('/', express.static(path.join(__dirname, `../../../frontend/${frontendDir}`)));

export default router;
