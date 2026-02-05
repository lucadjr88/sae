import { getRentedFleetsUtil } from '../../utils/getRentedFleets';
export async function getRentedFleetsHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        console.log(`[get-rented-fleets] INIZIO handler per profileId=${profileId}`);
        const result = await getRentedFleetsUtil(profileId);
        const rentedFleets = Array.isArray(result) ? result : [];
        const pubkeys = rentedFleets.map((r) => r.pubkey).filter(Boolean);
        console.log(`[get-rented-fleets] RESOCONTO: profileId=${profileId} rentedCount=${rentedFleets.length} pubkeys=${JSON.stringify(pubkeys)}`);
        return res.json({ profileId, rentedFleets });
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'getRentedFleets failed' });
    }
}
