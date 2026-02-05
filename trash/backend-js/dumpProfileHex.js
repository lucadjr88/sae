import { dumpProfileHexUtil } from '../../utils/dumpProfileHex';
export async function dumpProfileHexHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        const result = await dumpProfileHexUtil(profileId);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'Dump profile hex failed' });
    }
}
