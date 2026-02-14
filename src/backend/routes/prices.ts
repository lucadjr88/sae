import express from 'express';

const router = express.Router();

// 'wpac' non verrà trovato da CG, ma lo teniamo per inizializzare la chiave se necessario
const COINGECKO_IDS = ['bitcoin', 'solana', 'star-atlas', 'star-atlas-dao'];
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
// Assicurati che nel .env GECKOTERMINAL_NETWORK sia 'bsc'
const DEFAULT_GECKOTERMINAL_NETWORK = 'bsc'; 

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

router.get('/prices', async (req, res) => {
  const startTime = Date.now();
  //console.log(`[/api/prices] GET request received`);

  try {
    //console.log(`[/api/prices] Fetching coin prices from CoinGecko...`);
    // 1. Prendi i prezzi standard
    const data = await fetchCoinGeckoPrices();
    //console.log(`[/api/prices] ✓ CoinGecko prices fetched | coins=${Object.keys(data).length}`);

    // 2. Iniezione forzata di WPAC (dato che CoinGecko API standard non lo ha)
    const tokenAddress = process.env.GECKOTERMINAL_WPAC_TOKEN || '0x10004a9A742ec135c686C9aCed00FA3C93D66866';
    const network = process.env.GECKOTERMINAL_NETWORK || DEFAULT_GECKOTERMINAL_NETWORK;

    //console.log(`[/api/prices] Fetching WPAC price from GeckoTerminal...`);
    const wpacUsd = await fetchGeckoTerminalTokenPrice(network, tokenAddress);
    
    if (wpacUsd !== null) {
      data['wpac'] = { 
        usd: wpacUsd,
        last_updated_at: Math.floor(Date.now() / 1000) 
      };
      //console.log(`[/api/prices] ✓ WPAC price fetched | wpac=${wpacUsd}`);
    } else {
      console.warn(`[/api/prices] ⚠ WPAC price not available from GeckoTerminal`);
    }

    const duration = Date.now() - startTime;
    //console.log(`[/api/prices] ✅ SUCCESS | coins=${Object.keys(data).length} | duration=${duration}ms`);
    return res.json(data);
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[/api/prices] ❌ ERROR | ${e} | duration=${duration}ms`);
    return res.status(500).json({});
  }
});

export default router;