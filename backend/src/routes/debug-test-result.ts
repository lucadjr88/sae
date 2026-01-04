import { Request, Response } from 'express';
import fs from 'fs';
import { TEST_RESULT_PATH } from '../config/serverConfig.js';

export function debugTestResultHandler(_req: Request, res: Response) {
  try {
    if (!fs.existsSync(TEST_RESULT_PATH)) {
      return res.status(404).json({ error: 'test_result.json not found on server' });
    }
    const raw = fs.readFileSync(TEST_RESULT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return res.json(parsed);
  } catch (err: any) {
    console.error('❌ /api/debug/test-result error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
