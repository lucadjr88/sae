import { debugFleetBreakdown } from '../services/walletSageFeesStreaming/debug';
import { getWalletSageFeesStreamingServices } from '../services/walletSageFeesStreaming/types';

export async function debugFleetBreakdownHandler(req, res) {
  try {
    const walletPubkey = req.body.walletPubkey;
    const opts = req.body || {};
    const services = getWalletSageFeesStreamingServices();
    const result = await debugFleetBreakdown(services, walletPubkey, opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
