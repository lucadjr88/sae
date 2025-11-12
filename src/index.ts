import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGameInfo } from './examples/01-game.js';
import { getPlayerProfile } from './examples/02-profile.js';
import { getFleets } from './examples/03-fleets.js';
import { getPlanets } from './examples/04-planets.js';
import { getShipsForFleet } from './examples/05-compose-fleet.js';
import { getFleetTransactions, getWalletSageTransactions, getWalletSageFeesDetailed } from './examples/06-transactions.js';

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
    const result = await getPlayerProfile(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
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
    const result = await getFleets(RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, profileId);
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

// Detailed 24h SAGE fees with fleet breakdown
app.post('/api/wallet-sage-fees-detailed', async (req, res) => {
  const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, hours } = req.body;
  if (!walletPubkey) {
    return res.status(400).json({ error: 'walletPubkey required' });
  }
  try {
    const result = await getWalletSageFeesDetailed(
      RPC_ENDPOINT,
      RPC_WEBSOCKET,
      walletPubkey,
      fleetAccounts || [],
      fleetNames || {},  // This maps to fleetAccountNames parameter
      fleetRentalStatus || {},  // Pass rental status
      hours || 24
    );
    res.json(result);
  } catch (err: any) {
    console.error('❌ /api/wallet-sage-fees-detailed error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ SA Explorer running on http://localhost:${PORT}`);
  console.log(`   Access from network: http://staratlasexplorer.duckdns.org:${PORT}\n`);
});