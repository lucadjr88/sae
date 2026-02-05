import express from 'express';
import { fetchProfileFleets } from '../../utils/fetchProfileFleets';

const router = express.Router();

// GET /api/debug/get-fleets?profileId=...
router.get('/get-fleets', async (req, res) => {
  const profileId = req.query.profileId as string;
  console.log(`[get-fleets] INIZIO handler per profileId=${profileId}`);
  try {
    if (!profileId) {
      console.error(`[get-fleets] Errore: profileId mancante`);
      console.log(`[get-fleets] RESOCONTO (errore): profileId mancante`);
      return res.status(400).json({ error: 'Missing profileId' });
    }
    const fleets = await fetchProfileFleets(profileId);
    console.log(`[get-fleets] Risposta: profileId=${profileId} fleetsCount=${fleets.length}`);
    console.log(`[get-fleets] fleets JSON: ${JSON.stringify(fleets)}`);
    console.log(`[get-fleets] RESOCONTO: profileId=${profileId} fleetsCount=${fleets.length}`);
    res.json({ profileId, fleets });
    console.log(`[get-fleets] FINE handler profileId=${profileId}`);
  } catch (e: any) {
    console.error(`[get-fleets] Errore: ${e.message || String(e)}`);
    console.log(`[get-fleets] RESOCONTO (errore): profileId=${profileId} errore=${e.message || String(e)}`);
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
