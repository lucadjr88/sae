import express from 'express';
import fetchProfileRentedFleets from '../../utils/fetchProfileRentedFleets';

const router = express.Router();

// GET /api/debug/get-rented-fleets?profileId=...
router.get('/get-rented-fleets', async (req, res) => {
  const profileId = req.query.profileId as string;
  console.log(`[get-rented-fleets] INIZIO handler per profileId=${profileId}`);
  try {
    if (!profileId) {
      console.error(`[get-rented-fleets] Errore: profileId mancante`);
      return res.status(400).json({ error: 'Missing profileId' });
    }
    const rentedFleets = await fetchProfileRentedFleets(profileId);
    console.log(`[get-rented-fleets] Risposta: profileId=${profileId} rentedCount=${rentedFleets.length}`);
    const pubkeys = rentedFleets.map((r: any) => r.pubkey).filter(Boolean);
    console.log(`[get-rented-fleets] RESOCONTO: profileId=${profileId} rentedCount=${rentedFleets.length} pubkeys=${JSON.stringify(pubkeys)}`);
    res.json({ profileId, rentedFleets });
    console.log(`[get-rented-fleets] FINE handler profileId=${profileId}`);
  } catch (e: any) {
    console.error(`[get-rented-fleets] Errore: ${e.message || String(e)}`);
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
