import express from 'express';

const router = express.Router();

const COINGECKO_IDS = ['bitcoin', 'solana', 'star-atlas', 'star-atlas-dao', 'wpac'];
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const DEFAULT_GECKOTERMINAL_NETWORK = 'solana';

async function fetchCoinGeckoPrices() {
  const ids = COINGECKO_IDS.join(',');
  const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`);
  if (!cgRes.ok) return {};
  return cgRes.json();
}

async function fetchGeckoTerminalTokenPrice(network: string, tokenAddress: string) {
  const url = `${GECKOTERMINAL_BASE}/simple/networks/${network}/token_price/${tokenAddress}`;
  const gtRes = await fetch(url);
  if (!gtRes.ok) return null;
  const data = await gtRes.json();
  const prices = data?.data?.attributes?.token_prices || {};
  const priceStr = prices[tokenAddress] || prices[tokenAddress.toLowerCase()] || prices[tokenAddress.toUpperCase()];
  if (!priceStr) return null;
  const priceNum = Number(priceStr);
  return Number.isFinite(priceNum) ? priceNum : null;
}

// GET /api/prices
// Simple proxy to CoinGecko simple price API for frontend ticker
router.get('/prices', async (req, res) => {
  try {
    const data = await fetchCoinGeckoPrices();

    if (!data?.wpac?.usd) {
      const tokenAddress = process.env.GECKOTERMINAL_WPAC_TOKEN;
      const network = process.env.GECKOTERMINAL_NETWORK || DEFAULT_GECKOTERMINAL_NETWORK;
      if (tokenAddress) {
        const wpacUsd = await fetchGeckoTerminalTokenPrice(network, tokenAddress);
        if (wpacUsd !== null) {
          data.wpac = { usd: wpacUsd };
        }
      }
    }

    return res.json(data);
  } catch (e) {
    console.error('[/api/prices] error', e);
    return res.status(500).json({});
  }
});

export default router;
