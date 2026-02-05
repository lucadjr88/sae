import { decodeSageOpsUtil } from '../../utils/decodeSageOps';
export async function decodeSageOpsHandler(req, res) {
    const wallet = req.query.wallet;
    const lats = req.query.lats ? Number(req.query.lats) : 24;
    if (!wallet)
        return res.status(400).json({ error: 'Missing wallet' });
    try {
        const result = await decodeSageOpsUtil(wallet, lats);
        return res.json(result);
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'decodeSageOps failed' });
    }
}
