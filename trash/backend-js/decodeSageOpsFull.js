import fs from 'fs/promises';
import path from 'path';
import { decodeInstructions } from '../../decoders/decodeInstructions';
import { saveSageOpsToCache } from '../../utils/saveSageOpsToCache';
// GET /api/debug/decode-sage-ops-full?profileId=...
export async function decodeSageOpsFullHandler(req, res) {
    const profileId = req.query.profileId;
    if (!profileId)
        return res.status(400).json({ error: 'Missing profileId' });
    try {
        const walletTxsDir = path.join(process.cwd(), 'cache', profileId, 'wallet-txs');
        const walletDirs = await fs.readdir(walletTxsDir);
        let allTxs = [];
        for (const wallet of walletDirs) {
            const walletDir = path.join(walletTxsDir, wallet);
            let files = [];
            try {
                files = await fs.readdir(walletDir);
            }
            catch {
                continue;
            }
            for (const file of files) {
                if (!file.endsWith('.json'))
                    continue;
                try {
                    const raw = await fs.readFile(path.join(walletDir, file), 'utf8');
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.data)
                        allTxs.push({ raw: parsed.data, norm: parsed.data });
                }
                catch { }
            }
        }
        const decoded = decodeInstructions(allTxs);
        const sageOps = decoded.filter(op => op.success && op.instructionName !== 'Unknown');
        const unknown = decoded.filter(op => !op.success || op.instructionName === 'Unknown');
        await saveSageOpsToCache(profileId, sageOps);
        if (unknown.length > 0) {
            const { saveUnknownOps } = await import('../saveUnknownOps');
            await saveUnknownOps(profileId, unknown);
        }
        const total = sageOps.length + unknown.length;
        console.log(`[API] decode-sage-ops-full: profileId=${profileId} totale tx=${total}, sageOps=${sageOps.length}, unknown=${unknown.length}`);
        return res.json({ sageOps, unknown });
    }
    catch (e) {
        return res.status(500).json({ error: e?.message || 'decodeSageOpsFull failed' });
    }
}
