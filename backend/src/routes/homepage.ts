import { Request, Response } from 'express';
import path from 'path';
import { PUBLIC_DIR } from '../config/serverConfig.js';

export function homepageHandler(_req: Request, res: Response) {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
}
