
// --- IMPORTS E COSTANTI UNICHE ---
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { backOff } from 'exponential-backoff';
import { fileURLToPath } from 'url';

const CACHE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../interna_cache/tickers-prices.json');
const router = express.Router();

// Funzioni di persistenza cache su disco
async function savePricesToDisk(prices) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(prices), 'utf8');
  } catch (e) {
    console.error('[TickersCache] Write error:', e);
  }
}

async function loadPricesFromDisk() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Inizializza cartella e file cache se mancanti
async function ensureCacheFileExists() {
  const fsSync = await import('fs');
  const dir = path.dirname(CACHE_FILE);
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
  if (!fsSync.existsSync(CACHE_FILE)) {
    // Template prezzi 0.00
    const template = {
      bitcoin: { usd: 0.00, last_updated_at: 0 },
      solana: { usd: 0.00, last_updated_at: 0 },
      'star-atlas': { usd: 0.00, last_updated_at: 0 },
      'star-atlas-dao': { usd: 0.00, last_updated_at: 0 },
      wpac: { usd: 0.00, last_updated_at: 0 }
    };
    fsSync.writeFileSync(CACHE_FILE, JSON.stringify(template, null, 2), 'utf8');
  }
}


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
  // Retry con backoff esponenziale, max 5 tentativi
  return await backOff(async () => {
    const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`);
    if (!cgRes.ok) throw new Error('CoinGecko fetch failed');
    return cgRes.json();
  }, {numOfAttempts: 5, startingDelay: 500, timeMultiple: 2});
}

async function fetchGeckoTerminalTokenPrice(network: string, tokenAddress: string) {
  // Nota: l'endpoint /simple/ token_price restituisce i prezzi mappati sull'indirizzo
  const url = `${GECKOTERMINAL_BASE}/simple/networks/${network}/token_price/${tokenAddress}`;
  // Retry con backoff esponenziale, max 5 tentativi
  try {
    const json = await backOff(async () => {
      const gtRes = await fetch(url);
      if (!gtRes.ok) throw new Error(`[GeckoTerminal] Request failed: ${gtRes.status} ${gtRes.statusText}`);
      return gtRes.json();
    }, {numOfAttempts: 5, startingDelay: 500, timeMultiple: 2});
    const prices = json?.data?.attributes?.token_prices;
    const addr = tokenAddress.toLowerCase();
    const price = prices?.[addr];
    return price ? parseFloat(price) : null;
  } catch (e) {
    console.warn('[GeckoTerminal] Retry failed:', e);
    return null;
  }
}

async function updatePricesCache() {

  if (cacheUpdating) return;
  cacheUpdating = true;
  try {
    let data;
    try {
      data = await fetchCoinGeckoPrices();
    } catch (e) {
      // fallback: prova a caricare da disco se fetch fallisce
      console.error('[pricesCache] CoinGecko fetch failed, fallback to disk:', e);
      data = await loadPricesFromDisk() || {};
    }
    const tokenAddress = process.env.GECKOTERMINAL_WPAC_TOKEN || '0x10004a9A742ec135c686C9aCed00FA3C93D66866';
    const network = process.env.GECKOTERMINAL_NETWORK || DEFAULT_GECKOTERMINAL_NETWORK;
    let wpacUsd = null;
    try {
      wpacUsd = await fetchGeckoTerminalTokenPrice(network, tokenAddress);
    } catch (e) {
      console.warn('[pricesCache] GeckoTerminal fetch failed:', e);
    }
    if (wpacUsd !== null) {
      data['wpac'] = {
        usd: wpacUsd,
        last_updated_at: Math.floor(Date.now() / 1000)
      };
    }
    pricesCache = data;
    pricesCacheTimestamp = Date.now();
    await savePricesToDisk(data);
  } catch (e) {
    console.error(`[pricesCache] Update failed:`, e);
  } finally {
    cacheUpdating = false;
  }
}



// Lock file path per evitare concorrenza tra processi
const LOCK_FILE = CACHE_FILE + '.lock';

async function acquireLock() {
  const fsSync = await import('fs');
  try {
    // fs.openSync con flag 'wx' fallisce se il file esiste già
    fsSync.openSync(LOCK_FILE, 'wx');
    return true;
  } catch {
    return false;
  }
}

async function releaseLock() {
  const fsSync = await import('fs');
  try {
    fsSync.unlinkSync(LOCK_FILE);
  } catch {}
}

// All'avvio: assicurati che cartella e file cache esistano
ensureCacheFileExists().then(() => {
  // Tutti i processi provano a prendere il lock, solo uno aggiorna periodicamente
  acquireLock().then((hasLock) => {
    if (hasLock) {
      setInterval(async () => {
        await updatePricesCache();
      }, CACHE_TTL_MS);
      updatePricesCache();
      // Rilascia il lock solo alla chiusura del processo
      process.on('exit', releaseLock);
      process.on('SIGINT', () => { releaseLock(); process.exit(); });
      process.on('SIGTERM', () => { releaseLock(); process.exit(); });
    }
  });
});


// Lettura on-demand da disco
router.get('/prices', async (req, res) => {
  const diskCache = await loadPricesFromDisk();
  if (diskCache) {
    return res.json(diskCache);
  } else {
    return res.status(503).json({ error: 'Prices cache not ready' });
  }
});

export { router as pricesRouter };

