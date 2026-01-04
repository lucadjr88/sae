import { Request, Response } from 'express';

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
    // TODO: Implement cache deletion by profile pattern
    // For now, just acknowledge - cache will be overwritten on next fetch
    res.json({ success: true, message: 'Cache wipe acknowledged' });
  } catch (err: any) {
    console.error('Cache wipe error:', err);
    res.status(500).json({ error: err.message });
  }
}