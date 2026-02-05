import { scanProfileOwnerUtil } from '../../utils/scanProfileOwner';
export async function scanProfileOwnerHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        const result = await scanProfileOwnerUtil(profileId);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'Scan profile owner failed' });
    }
}
