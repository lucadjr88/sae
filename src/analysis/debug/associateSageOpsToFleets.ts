import { Request, Response } from 'express';
import { associateSageOpsToFleetsUtil } from '../../utils/associateSageOpsToFleets';

export async function associateSageOpsToFleetsHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const result = await associateSageOpsToFleetsUtil(profileId);
    console.log(`[debug handler] associate-sage-ops-to-fleets profileId=${profileId} result=${JSON.stringify(result)}`);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'associateSageOpsToFleets failed' });
  }
}
