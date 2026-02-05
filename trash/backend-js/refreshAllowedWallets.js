import { refreshAllowedWalletsUtil } from '../../utils/refreshAllowedWallets';
export async function refreshAllowedWalletsHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        const result = await refreshAllowedWalletsUtil(profileId);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'Refresh allowed wallets failed' });
    }
}
