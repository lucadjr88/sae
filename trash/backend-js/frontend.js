// Serve static frontend files from /frontend
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const router = express.Router();
// Fix __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve frontend at /frontend route
router.use('/', express.static(path.join(__dirname, '../../../frontend/src')));
export default router;
