import path from 'path';
import fs from 'fs';

const projectRoot = process.env.PROJECT_ROOT || process.cwd();
const publicDir = process.env.PUBLIC_DIR || path.join(projectRoot, 'public');

// Configurazione variabili ambiente e percorsi
export const PORT = process.env.PORT || 3000;
export let RPC_ENDPOINT: string = process.env.RPC_ENDPOINT || '';
export let RPC_WEBSOCKET: string = process.env.RPC_WEBSOCKET || '';

try {
  const rpcPoolRaw = fs.readFileSync(path.join(publicDir, 'rpc-pool.json'), 'utf8');
  const rpcPool = JSON.parse(rpcPoolRaw);
  if (rpcPool && rpcPool.length > 0) {
    RPC_ENDPOINT = rpcPool[0].url;
    // Per ora websocket non usato, si può estendere in futuro
  }
} catch (err) {
  console.warn('⚠️ Impossibile caricare rpc-pool.json, uso endpoint di default:', err);
  RPC_ENDPOINT = RPC_ENDPOINT || 'https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
  RPC_WEBSOCKET = RPC_WEBSOCKET || 'wss://rpc.helius.xyz/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
}

export const WALLET_PATH = process.env.WALLET_PATH || path.join(projectRoot, 'id.json');
export const PUBLIC_DIR = publicDir;
export const TEST_RESULT_PATH = path.join(projectRoot, 'test_result.json');
