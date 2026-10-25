import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const router = express.Router();

let frontendLogStream: fs.WriteStream | null = null;

function getFrontendLogStream(): fs.WriteStream | null {
  if (frontendLogStream) return frontendLogStream;
  const directory = process.env.SAE_LOG_DIR || '/home/luca/condivisione/sae log condivisi';
  try {
    fs.mkdirSync(directory, { recursive: true });
    const startedAt = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const filename = `frontend-${startedAt}-pid-${process.pid}.log`;
    frontendLogStream = fs.createWriteStream(path.join(directory, filename), { flags: 'a', mode: 0o640 });
    return frontendLogStream;
  } catch {
    return null;
  }
}

router.post('/log', (req, res) => {
  const { level, message, args, timestamp } = req.body || {};
  const stream = getFrontendLogStream();
  if (!stream) {
    return res.status(500).json({ error: 'log stream unavailable' });
  }
  const safeArgs = Array.isArray(args) ? args.map(a => {
    try { return JSON.stringify(a); } catch { return String(a); }
  }) : [];
  const line = `[${timestamp || new Date().toISOString()}] [pid=${process.pid}] [frontend:${level}] ${message} ${safeArgs.length ? safeArgs.join(' ') : ''}\n`;
  stream.write(line, err => {
    if (err) return res.status(500).json({ error: 'write failed' });
    res.json({ ok: true });
  });
});

export default router;