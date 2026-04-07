import express, { Router, Request, Response } from 'express';
import { decodeResources, ResourceFlowSummary } from '../../utils/resources_analyses.js';
import { getCache } from '../../utils/cache.js';

const router: Router = express.Router();

router.post('/resource-flows', async (req: Request, res: Response) => {
  console.log('[resource-flows] POST request received');  
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: 'profileId required' });
      console.warn('[resource-flows] Missing profileId in request body');
    }

    const result = await decodeResources(profileId);
    console.log(`[resource-flows] Successfully decoded resources for profileId ${profileId}`);
    return res.json({ success: true, data: result });
  } catch (e: any) {
    console.log('[resource-flows] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

router.get('/resource-flows/:profileId', async (req: Request, res: Response) => {
  try {
    let { profileId } = req.params;
    if (Array.isArray(profileId)) profileId = profileId[0];
    if (!profileId) {
      return res.status(400).json({ error: 'profileId required' });
    }

    const cached = await getCache('resources', 'flows', profileId);
    if (cached) {
      return res.json({ success: true, data: cached.data, fromCache: true });
    }

    const result = await decodeResources(profileId);
    return res.json({ success: true, data: result });
  } catch (e: any) {
    console.log('[resource-flows GET] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
