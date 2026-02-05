import { dumpFleetsUtil } from '../../utils/dumpFleets';
export async function dumpFleetsHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        const result = await dumpFleetsUtil(profileId);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'Dump fleets failed' });
    }
}
