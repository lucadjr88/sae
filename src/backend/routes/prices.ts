import express from 'express';

const router = express.Router();

// GET /api/prices
// Simple proxy to CoinGecko simple price API for frontend ticker
router.get('/prices', async (req, res) => {
  try {
    const ids = ['bitcoin', 'solana', 'star-atlas', 'star-atlas-dao', 'wpac'].join(',');
    const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`);
    if (!cgRes.ok) return res.status(502).json({});
    const data = await cgRes.json();
    return res.json(data);
  } catch (e) {
    console.error('[/api/prices] error', e);
    return res.status(500).json({});
  }
});

export default router;
