
// --- IMPORTS E COSTANTI UNICHE ---
import fs from 'fs/promises';
import * as fsSync from 'fs';
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
    console.log('[TickersCache] Write error:', e);
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
      console.log('[pricesCache] CoinGecko fetch failed, fallback to disk:', e);
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
    console.log(`[pricesCache] Update failed:`, e);
  } finally {
    cacheUpdating = false;
  }
}



// Lock file path per evitare concorrenza tra processi
const LOCK_FILE = CACHE_FILE + '.lock';
const LOCK_HEARTBEAT_MS = 30 * 1000;
const LOCK_EXPIRE_MS = 90 * 1000;
let lockHeartbeatTimer: NodeJS.Timeout | null = null;
let lockRetryTimer: NodeJS.Timeout | null = null;
let pricesUpdateTimer: NodeJS.Timeout | null = null;
let shutdownHooksRegistered = false;
let lockHeld = false;

function buildLockPayload() {
  const now = Date.now();
  return JSON.stringify({
    pid: process.pid,
    updatedAt: now,
    expiresAt: now + LOCK_EXPIRE_MS
  });
}

function isLockStale(rawLock: string | null) {
  if (!rawLock) return true;
  try {
    const parsed = JSON.parse(rawLock);
    const expiresAt = Number(parsed?.expiresAt);
    if (!Number.isFinite(expiresAt)) return true;
    return Date.now() >= expiresAt;
  } catch {
    return true;
  }
}

function startLockHeartbeat() {
  if (lockHeartbeatTimer) return;
  lockHeartbeatTimer = setInterval(() => {
    if (!lockHeld) return;
    try {
      fsSync.writeFileSync(LOCK_FILE, buildLockPayload(), 'utf8');
    } catch (e) {
      console.warn('[TickersCache] Lock heartbeat failed:', e);
    }
  }, LOCK_HEARTBEAT_MS);
}

function startPriceUpdateLoop() {
  if (pricesUpdateTimer) return;
  pricesUpdateTimer = setInterval(async () => {
    await updatePricesCache();
  }, CACHE_TTL_MS);
  updatePricesCache();
}

function registerShutdownHooks() {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  process.on('exit', releaseLock);
  process.on('SIGINT', async () => { await releaseLock(); process.exit(); });
  process.on('SIGTERM', async () => { await releaseLock(); process.exit(); });
}

async function acquireLock() {
  try {
    fsSync.writeFileSync(LOCK_FILE, buildLockPayload(), { encoding: 'utf8', flag: 'wx' });
    lockHeld = true;
    return true;
  } catch (e: any) {
    if (e?.code !== 'EEXIST') {
      console.warn('[TickersCache] Lock acquisition failed:', e);
      return false;
    }
  }

  try {
    const rawLock = fsSync.readFileSync(LOCK_FILE, 'utf8');
    if (!isLockStale(rawLock)) {
      return false;
    }
    fsSync.unlinkSync(LOCK_FILE);
  } catch (e) {
    console.warn('[TickersCache] Failed to inspect stale lock, retrying acquisition:', e);
  }

  try {
    fsSync.writeFileSync(LOCK_FILE, buildLockPayload(), { encoding: 'utf8', flag: 'wx' });
    lockHeld = true;
    return true;
  } catch {
    return false;
  }
}

async function releaseLock() {
  lockHeld = false;
  if (lockHeartbeatTimer) {
    clearInterval(lockHeartbeatTimer);
    lockHeartbeatTimer = null;
  }
  try {
    fsSync.unlinkSync(LOCK_FILE);
  } catch {}
}

// All'avvio: assicurati che cartella e file cache esistano
ensureCacheFileExists().then(() => {
  const tryBecomeUpdater = async () => {
    if (lockHeld) return;
    const hasLock = await acquireLock();
    if (!hasLock) return;
    startLockHeartbeat();
    startPriceUpdateLoop();
    registerShutdownHooks();
  };

  // Tutti i processi provano ad acquisire lock; uno aggiorna periodicamente
  tryBecomeUpdater();

  if (!lockRetryTimer) {
    lockRetryTimer = setInterval(() => {
      tryBecomeUpdater();
    }, LOCK_HEARTBEAT_MS);
  }
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

