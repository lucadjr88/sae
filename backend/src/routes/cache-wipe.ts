import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { cachePath } from '../utils/cache-path.js';

/**
 * Cache wipe endpoint
 */
export async function cacheWipeHandler(req: Request, res: Response) {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    console.log(`[cache] Wiping cache for profile: ${profileId}`);
    const root = cachePath(profileId).root;
    await fs.rm(root, { recursive: true, force: true });
    res.json({ success: true, message: 'Cache wiped successfully' });
  } catch (err: any) {
    console.error('Cache wipe error:', err);
    res.status(500).json({ error: err.message });
  }
}