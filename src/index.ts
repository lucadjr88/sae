import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getGameInfo } from './examples/01-game.js';
import { getPlayerProfile } from './examples/02-profile.js';
import { getFleets } from './examples/03-fleets.js';
import { getPlanets } from './examples/04-planets.js';
import { getShipsForFleet } from './examples/05-compose-fleet.js';
import { getFleetTransactions, getWalletSageTransactions, getWalletSageFeesDetailed } from './examples/06-transactions.js';
import { getCacheDataOnly, getCacheWithTimestamp, setCache } from './utils/persist-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Config
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
const RPC_WEBSOCKET = process.env.RPC_WEBSOCKET || 'wss://rpc.helius.xyz/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
const WALLET_PATH = process.env.WALLET_PATH || path.join(__dirname, '../id.json');

console.log('🚀 SA Explorer Server Configuration:');
console.log('   RPC Endpoint:', RPC_ENDPOINT.replace(/api-key=[^&]+/, 'api-key=***'));
console.log('   Wallet Path:', WALLET_PATH);
console.log('   Port:', PORT);

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API: 01 - Game Info
app.get('/api/game', async (req, res) => {
  try {
    const result = await getGameInfo(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// API: 02 - Player Profile
app.post('/api/profile', async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    if (!refresh) {
      const cached = await getCacheDataOnly<any>('profile', profileId);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        return res.json(cached);
      }
    }
    const result = await getPlayerProfile(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
    await setCache('profile', profileId, result);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: 03 - Fleets
app.post('/api/fleets', async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    if (!refresh) {
      const cached = await getCacheDataOnly<any>('fleets', profileId);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        return res.json(cached);
      }
    }
    const result = await getFleets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
    await setCache('fleets', profileId, result);
    res.json(result);
  } catch (err: any) {
    console.error('❌ /api/fleets error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

// API: 04 - Planets
app.post('/api/planets', async (req, res) => {
  const { x, y } = req.body;
  if (x === undefined || y === undefined) {
    return res.status(400).json({ error: 'x and y coordinates required' });
  }
  try {
    const result = await getPlanets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, parseInt(x), parseInt(y));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: 05 - Ships for Fleet Composition
app.post('/api/compose-fleet', async (req, res) => {
  const { profileId, x, y } = req.body;
  if (!profileId || x === undefined || y === undefined) {
    return res.status(400).json({ error: 'profileId, x, and y required' });
  }
  try {
    const result = await getShipsForFleet(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId, parseInt(x), parseInt(y));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: 06 - Fleet Transactions
app.post('/api/transactions', async (req, res) => {
  const { accountPubkey, limit } = req.body;
  if (!accountPubkey) {
    return res.status(400).json({ error: 'accountPubkey required' });
  }
  try {
    const result = await getFleetTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, accountPubkey, limit || 50);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: 07 - Wallet SAGE Transactions & Fees
app.post('/api/wallet-sage-fees', async (req, res) => {
  const { walletPubkey, limit } = req.body;
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }
  try {
    const result = await getWalletSageTransactions(RPC_ENDPOINT, RPC_WEBSOCKET, walletPubkey, limit || 100);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Streaming detailed 24h SAGE fees with progressive updates
app.post('/api/wallet-sage-fees-stream', async (req, res) => {
  const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, hours } = req.body;
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }
  
  // Check for cached results first
  const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
  const update = (req.query.update === 'true') || (req.body && req.body.update === true);
  const keyPayload = JSON.stringify({ a: fleetAccounts || [], n: fleetNames || {}, r: fleetRentalStatus || {}, h: hours || 24 });
  const cacheKey = `${walletPubkey}__${keyPayload}`;
  
  // Helper to get cache hash for debugging
  const cacheHash = crypto.createHash('sha256').update(cacheKey).digest('hex');
  console.log(`[stream] Cache key hash: ${cacheHash.substring(0, 16)}...`);
  
  console.log(`[stream] Request for wallet ${walletPubkey.substring(0, 8)}... refresh=${refresh}, update=${update}`);
  
  // For update mode, retrieve cached data to use as base
  let cachedData = null;
  let lastProcessedSignature = null;
  if (update) {
    const cached = await getCacheWithTimestamp<any>('wallet-fees-detailed', cacheKey);
    if (cached) {
      const cacheAgeMs = Date.now() - cached.savedAt;
      const sixHoursMs = 6 * 60 * 60 * 1000;
      if (cacheAgeMs < sixHoursMs) {
        console.log(`[stream] ⚡ Update mode: cache is fresh (${(cacheAgeMs / 60000).toFixed(1)}min), will fetch only new transactions`);
        cachedData = cached.data;
        // Extract the most recent signature from cached transactions
        if (cachedData.allTransactions && cachedData.allTransactions.length > 0) {
          lastProcessedSignature = cachedData.allTransactions[0].signature;
          console.log(`[stream] Last processed signature: ${lastProcessedSignature.substring(0, 8)}...`);
        } else {
          console.log('[stream] ⚠️ Legacy cache detected (missing allTransactions). Performing full fetch this time to upgrade format.');
        }
      } else {
        console.log(`[stream] ⚠️ Update mode: cache too old (${(cacheAgeMs / 3600000).toFixed(1)}h), doing full refresh`);
        // Fall through to full refresh
      }
    } else {
      console.log(`[stream] ⚠️ Update mode: no cache found, doing full fetch`);
    }
  }
  
  if (!refresh && !update) {
    const cached = await getCacheWithTimestamp<any>('wallet-fees-detailed', cacheKey);
    if (cached) {
      const cacheAgeMs = Date.now() - cached.savedAt;
      const cacheAgeMin = (cacheAgeMs / 60000).toFixed(1);
      console.log(`[stream] ✅ Cache HIT! Age: ${cacheAgeMin} minutes`);
      
      // Return cached data via SSE format (single complete message)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Cache-Hit', 'disk');
      res.setHeader('X-Cache-Timestamp', String(cached.savedAt));
      res.flushHeaders();
      
      res.write(`data: ${JSON.stringify({ type: 'complete', ...cached.data, fromCache: true })}\n\n`);
      res.end();
      return;
    } else {
      console.log(`[stream] ❌ Cache MISS - processing fresh data`);
    }
  } else if (refresh) {
    console.log(`[stream] 🔄 Refresh requested - bypassing cache`);
  }
  
  // Set up SSE headers for fresh data
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const sendUpdate = (data: any) => {
    try {
      console.log(`[stream] -> sendUpdate type=${data.type || 'unknown'} stage=${data.stage || ''} processed=${data.processed || ''}`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error('[stream] Failed to write SSE chunk', e);
    }
    // Force flush to ensure message is sent immediately
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };
  
  // Incremental cache callback - saves progress after each batch
  const saveProgress = async (partialResult: any) => {
    try {
      await setCache('wallet-fees-detailed', cacheKey, partialResult);
      console.log(`[stream] 📦 Incremental cache saved (${partialResult.transactionCount24h || 0} tx processed)`);
    } catch (err) {
      console.error('[stream] Failed to save incremental cache:', err);
    }
  };
  
  try {
    const { getWalletSageFeesDetailedStreaming } = await import('./examples/06-transactions.js');
    
    const finalResult = await getWalletSageFeesDetailedStreaming(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      walletPubkey,
      fleetAccounts || [],
      fleetNames || {},
      fleetRentalStatus || {},
      hours || 24,
      sendUpdate,
      saveProgress,
      cachedData,
      lastProcessedSignature
    );
    
    // Save to cache
    if (finalResult) {
      console.log(`[stream] 💾 Saving to cache for wallet ${walletPubkey.substring(0, 8)}...`);
      await setCache('wallet-fees-detailed', cacheKey, finalResult);
      console.log(`[stream] ✅ Cache saved successfully`);
    }
    
    // Small delay to ensure final message is received before closing
    await new Promise(resolve => setTimeout(resolve, 100));
    res.end();
  } catch (err: any) {
    console.error('❌ /api/wallet-sage-fees-stream error:', err.message);
    sendUpdate({ error: err.message });
    res.end();
  }
});

// Cache wipe endpoint
app.post('/api/cache/wipe', async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  
  try {
    console.log(`[cache] Wiping cache for profile: ${profileId}`);
    // TODO: Implement cache deletion by profile pattern
    // For now, just acknowledge - cache will be overwritten on next fetch
    res.json({ success: true, message: 'Cache wipe acknowledged' });
  } catch (err: any) {
    console.error('Cache wipe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Detailed 24h SAGE fees with fleet breakdown (legacy non-streaming)
app.post('/api/wallet-sage-fees-detailed', async (req, res) => {
  const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, hours } = req.body;
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }
  try {
    const refresh = (req.query.refresh === 'true') || (req.body && req.body.refresh === true);
    const keyPayload = JSON.stringify({ a: fleetAccounts || [], n: fleetNames || {}, r: fleetRentalStatus || {}, h: hours || 24 });
    // Use persist cache keyed by wallet + request fingerprint
    const cacheKey = `${walletPubkey}__${keyPayload}`;
    if (!refresh) {
      const cached = await getCacheWithTimestamp<any>('wallet-fees-detailed', cacheKey);
      if (cached) {
        res.setHeader('X-Cache-Hit', 'disk');
        res.setHeader('X-Cache-Timestamp', String(cached.savedAt));
        return res.json(cached.data);
      }
    }

    const result = await getWalletSageFeesDetailed(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      walletPubkey,
      fleetAccounts || [],
      fleetNames || {},  // This maps to fleetAccountNames parameter
      fleetRentalStatus || {},  // Pass rental status
      hours || 24,
      { refresh }
    );
    await setCache('wallet-fees-detailed', cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('❌ /api/wallet-sage-fees-detailed error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

// Diagnostics: Fleet account/name/rental map for a profile
app.post('/api/diagnostics/fleet-map', async (req, res) => {
  const { profileId } = req.body;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId required' });
  }
  try {
    const { fleets, walletAuthority } = await getFleets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
    const map: { [account: string]: { name: string; isRented: boolean } } = {};
    const rows = fleets.map((f: any) => {
      const name = f.callsign;
      const isRented = !!f.isRented;
      const accounts = [
        f.key,
        f.data?.fleetShips,
        f.data?.fuelTank,
        f.data?.ammoBank,
        f.data?.cargoHold,
      ].filter((x: string | undefined) => !!x);
      accounts.forEach((acc: string) => { map[acc] = { name, isRented }; });
      return {
        name,
        key: f.key,
        fleetShips: f.data?.fleetShips,
        fuelTank: f.data?.fuelTank,
        ammoBank: f.data?.ammoBank,
        cargoHold: f.data?.cargoHold,
        owningProfile: f.data?.owningProfile?.toString?.() || null,
        subProfile: f.data?.subProfile?.toString?.() || null,
        isRented,
      };
    });
    res.json({ success: true, walletAuthority, rows, map });
  } catch (err: any) {
    console.error('❌ /api/diagnostics/fleet-map error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ SA Explorer running on http://localhost:${PORT}`);
  console.log(`   Access from network: http://staratlasexplorer.duckdns.org:${PORT}\n`);
});