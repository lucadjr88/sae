
// --- IMPORTS E COSTANTI UNICHE ---
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import nodeFetch from 'node-fetch';

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


const COINGECKO_IDS = ['bitcoin', 'solana', 'star-atlas', 'star-atlas-dao', 'pactus'];
const PRICE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const PRICE_ATTEMPT_PREFIX = 'tickers-prices.attempt-';

// --- CACHE ---

let pricesCache = {};
let pricesCacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;
let cacheUpdating = false;

async function fetchCoinGeckoPrices() {
  const ids = COINGECKO_IDS.join(',');
  const cgRes = await nodeFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`);
  if (!cgRes.ok) throw new Error(`CoinGecko fetch failed: ${cgRes.status} ${cgRes.statusText}`);
  return cgRes.json();
}

async function reservePriceAttempt(): Promise<boolean> {
  const dir = path.dirname(CACHE_FILE);
  const window = Math.floor(Date.now() / PRICE_ATTEMPT_WINDOW_MS);
  const files = await fs.readdir(dir);
  for (const file of files) {
    if (!file.startsWith(PRICE_ATTEMPT_PREFIX)) continue;
    const suffix = file.slice(PRICE_ATTEMPT_PREFIX.length);
    if (!/^\d+$/.test(suffix) || Number(suffix) >= window - 1) continue;
    try {
      await fs.unlink(path.join(dir, file));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  // Reserving both windows prevents attempts less than ten minutes apart across workers.
  for (const slot of [window, window + 1]) {
    try {
      const handle = await fs.open(path.join(dir, `${PRICE_ATTEMPT_PREFIX}${slot}`), 'wx');
      await handle.close();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw e;
    }
  }
  return Math.floor(Date.now() / PRICE_ATTEMPT_WINDOW_MS) === window;
}

async function updatePricesCache() {

  if (cacheUpdating) return;
  cacheUpdating = true;
  try {
    if (!await reservePriceAttempt()) return;
    const data = await fetchCoinGeckoPrices();
    if (Number.isFinite(data?.pactus?.usd) && data.pactus.usd > 0) {
      data['wpac'] = data.pactus;
    } else {
      console.warn('[pricesCache] CoinGecko returned no valid Pactus price');
      const cached = await loadPricesFromDisk();
      if (cached?.wpac) data['wpac'] = cached.wpac;
    }
    delete data.pactus;
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
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
        clearInterval(lockHeartbeatTimer);
        lockHeld = false;
        lockHeartbeatTimer = null;
        return;
      }
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
    try {
      fsSync.unlinkSync(LOCK_FILE);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  } catch (e) {
    if (e?.code !== 'ENOENT') {
      console.warn('[TickersCache] Failed to inspect stale lock, retrying acquisition:', e);
    }
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
