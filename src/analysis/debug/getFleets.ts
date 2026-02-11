import { Request, Response } from 'express';
import { getFleetsUtil } from '../../utils/getFleets';

export async function getFleetsHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  console.log(`[debug:get-fleets] INIZIO handler profileId=${profileId}`);
  if (!profileId) {
    console.error(`[debug:get-fleets] Errore: profileId mancante`);
    console.log(`[debug:get-fleets] RESOCONTO (errore): profileId mancante`);
    return res.status(400).json({ error: 'Missing profileId' });
  }
  try {
    const result = await getFleetsUtil(profileId);
    console.log(`[debug:get-fleets] RESOCONTO: profileId=${profileId} fleetsCount=${result.length}`);
    return res.json(result);
  } catch (e: any) {
    console.log(`[debug:get-fleets] RESOCONTO (errore): profileId=${profileId} errore=${e?.message || 'getFleets failed'}`);
    return res.status(500).json({ error: e?.message || 'getFleets failed' });
  }
}
