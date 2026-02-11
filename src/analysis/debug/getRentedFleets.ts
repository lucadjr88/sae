import { Request, Response } from 'express';
import { getRentedFleetsUtil } from '../../utils/getRentedFleets';

export async function getRentedFleetsHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    console.log(`[get-rented-fleets] INIZIO handler per profileId=${profileId}`);
    const result = await getRentedFleetsUtil(profileId);
    const rentedFleets = Array.isArray(result) ? result : [];
    const pubkeys = rentedFleets.map((r: any) => r.pubkey).filter(Boolean);
    console.log(`[get-rented-fleets] RESOCONTO: profileId=${profileId} rentedCount=${rentedFleets.length} pubkeys=${JSON.stringify(pubkeys)}`);
    return res.json({ profileId, rentedFleets });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'getRentedFleets failed' });
  }
}
