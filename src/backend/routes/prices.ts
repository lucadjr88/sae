import express from 'express';

const router = express.Router();

const COINGECKO_IDS = ['bitcoin', 'solana', 'star-atlas', 'star-atlas-dao'];
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const DEFAULT_GECKOTERMINAL_NETWORK = 'bsc';

// --- CACHE ---
let pricesCache = {};
let pricesCacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;
let cacheUpdating = false;

async function fetchCoinGeckoPrices() {
  const ids = COINGECKO_IDS.join(',');
  const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`);
  if (!cgRes.ok) return {};
  return cgRes.json();
}

async function fetchGeckoTerminalTokenPrice(network: string, tokenAddress: string) {
  // Nota: l'endpoint /simple/ token_price restituisce i prezzi mappati sull'indirizzo
  const url = `${GECKOTERMINAL_BASE}/simple/networks/${network}/token_price/${tokenAddress}`;
  //console.log(`[GeckoTerminal] Fetching: ${url}`);
  const gtRes = await fetch(url);
  if (!gtRes.ok) {
    console.warn(`[GeckoTerminal] Request failed: ${gtRes.status} ${gtRes.statusText}`);
    return null;
  }
  
  const json = await gtRes.json();
  const prices = json?.data?.attributes?.token_prices;
  
  // GeckoTerminal restituisce le chiavi quasi sempre in minuscolo
  const addr = tokenAddress.toLowerCase();
  const price = prices?.[addr];
  
  //console.log(`[GeckoTerminal] Token ${addr} price: ${price}`);
  return price ? parseFloat(price) : null;
}

async function updatePricesCache() {
  if (cacheUpdating) return;
  cacheUpdating = true;
  try {
    const data = await fetchCoinGeckoPrices();
    const tokenAddress = process.env.GECKOTERMINAL_WPAC_TOKEN || '0x10004a9A742ec135c686C9aCed00FA3C93D66866';
    const network = process.env.GECKOTERMINAL_NETWORK || DEFAULT_GECKOTERMINAL_NETWORK;
    const wpacUsd = await fetchGeckoTerminalTokenPrice(network, tokenAddress);
    if (wpacUsd !== null) {
      data['wpac'] = {
        usd: wpacUsd,
        last_updated_at: Math.floor(Date.now() / 1000)
      };
    }
    pricesCache = data;
    pricesCacheTimestamp = Date.now();
  } catch (e) {
    console.error(`[pricesCache] Update failed:`, e);
  } finally {
    cacheUpdating = false;
  }
}

setInterval(updatePricesCache, CACHE_TTL_MS);
updatePricesCache();

router.get('/prices', async (req, res) => {
  const now = Date.now();
  if (!pricesCacheTimestamp || now - pricesCacheTimestamp > CACHE_TTL_MS) {
    updatePricesCache();
  }
  if (Object.keys(pricesCache).length === 0) {
    return res.status(503).json({ error: 'Prices cache not ready' });
  }
  return res.json(pricesCache);
});

export default router;