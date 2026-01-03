import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getGameInfo } from './examples/01-game.js';
import { getPlayerProfile } from './examples/02-profile.js';
import { getFleets } from './examples/getFleets-modular.js';
import { getPlanets } from './examples/04-planets.js';
import { getShipsForFleet } from './examples/05-compose-fleet.js';
import { getFleetTransactions } from './examples/fleet-transactions.js';
import { getWalletSageTransactions } from './examples/wallet-sage-transactions.js';
import { getWalletSageFeesDetailed } from './examples/wallet-sage-fees-detailed.js';
import { getCacheDataOnly, getCacheWithTimestamp, setCache } from './utils/persist-cache.js';
import { decodeSageInstruction, decodeSageInstructionFromLogs } from './decoders/sage-crafting-decoder.js';
import { SAGE_STARBASED_INSTRUCTIONS, CRAFTING_INSTRUCTIONS } from './decoders/instruction-maps.js';
import fetch from 'node-fetch';
import fs from 'fs';
import { getRpcMetrics, pickNextRpcConnection, tryAcquireRpc, releaseRpc, markRpcFailure, markRpcSuccess } from './utils/rpc-pool.js';
import { getGlobalRpcPoolManager, createRpcPoolManager } from './utils/rpc/rpc-pool-manager.js';
import { RpcPoolConnection } from './utils/rpc/pool-connection.js';
import { RpcPoolAdapter, RpcPoolAdapterWithFetch } from './services/RpcPoolAdapter.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { nlog } from './utils/log-normalizer.js';
import { scanFeePayerForRented } from './utils/fee-payer-scan.js';
import { PORT, RPC_ENDPOINT, RPC_WEBSOCKET, WALLET_PATH, PUBLIC_DIR, TEST_RESULT_PATH } from './config/serverConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    }
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize RPC pool singleton at server startup
const rpcPoolManager = getGlobalRpcPoolManager();
console.log(`RPC Pool initialized with ${rpcPoolManager.getPoolSize()} endpoints`);

// Create a shared RPC pool connection for all requests
export const defaultServerConnection = new Connection(RPC_ENDPOINT, 'confirmed');
export const globalPoolConnection = new RpcPoolConnection(defaultServerConnection, rpcPoolManager);
const globalRpcPoolAdapter = new RpcPoolAdapter();
export const globalRpcPoolAdapterWithFetch = new RpcPoolAdapterWithFetch(globalRpcPoolAdapter);

console.log('SA Explorer Server Configuration:');
console.log('   RPC Endpoint:', RPC_ENDPOINT.replace(/api-key=[^&]+/, 'api-key=***'));
console.log('   Wallet Path:', WALLET_PATH);
console.log('   Port:', PORT);

// Homepage

import { homepageHandler } from './routes/homepage.js';
app.get('/', homepageHandler);

// Debug endpoint: return local test_result.json to force UI rendering of known dataset

import { debugTestResultHandler } from './routes/debug-test-result.js';
app.get('/api/debug/test/result', debugTestResultHandler);

// Health check

import { healthHandler } from './routes/health.js';
app.get('/health', healthHandler);

import { gameHandler } from './routes/game.js';
app.get('/api/game', gameHandler);

import { profileHandler } from './routes/profile.js';
app.post('/api/profile', profileHandler);

import { fleetsHandler } from './routes/fleets.js';
app.post('/api/fleets', fleetsHandler);

import { planetsHandler } from './routes/planets.js';
app.post('/api/planets', planetsHandler);

import { composeFleetHandler } from './routes/compose-fleet.js';
app.post('/api/compose-fleet', composeFleetHandler);

import { transactionsHandler } from './routes/transactions.js';
app.post('/api/transactions', transactionsHandler);

import { walletSageFeesHandler } from './routes/wallet-sage-fees.js';
app.post('/api/wallet-sage-fees', walletSageFeesHandler);

import { walletSageFeesStreamHandler } from './routes/wallet-sage-fees-stream.js';
app.post('/api/wallet-sage-fees-stream', walletSageFeesStreamHandler);

import { cacheWipeHandler } from './routes/cache-wipe.js';
app.post('/api/cache/wipe', cacheWipeHandler);

import { walletSageFeesDetailedHandler } from './routes/wallet-sage-fees-detailed.js';
app.post('/api/wallet-sage-fees-detailed', walletSageFeesDetailedHandler);

import { diagnosticsFleetMapHandler } from './routes/diagnostics.js';
app.post('/api/diagnostics/fleet-map', diagnosticsFleetMapHandler);


import { debugFleetAssociationCheckHandler } from './routes/debug-fleet-association-check.js';
app.post('/api/debug/fleet-association-check', debugFleetAssociationCheckHandler);

import debugFleetBreakdownRouter from './routes/debug-fleet-breakdown.js';
app.use('/api/debug/fleet-breakdown', debugFleetBreakdownRouter);

import { debugTransactionFleetMappingHandler } from './routes/debug-transaction-fleet-mapping.js';
app.post('/api/debug/transaction-fleet-mapping', debugTransactionFleetMappingHandler);

import { pricesHandler } from './routes/prices.js';
app.get('/api/prices', pricesHandler);

import { wpacHandler } from './routes/wpac.js';
app.get('/api/wpac', wpacHandler);

import { txDetailsHandler } from './routes/tx-details.js';
app.get('/api/tx-details/:txid', txDetailsHandler);

import { replaceBigInt } from './utils/replace-bigint.js';

import { decodeInstructionHandler } from './routes/decode-instruction.js';
app.get('/api/decode-instruction/:instruction', decodeInstructionHandler);

import { decodersInfoHandler } from './routes/decoders-info.js';
app.get('/api/decoders/info', decodersInfoHandler);

app.listen(PORT, () => {
  console.log(`\n✅ SA Explorer running on http://localhost:${PORT}`);
  console.log(`   Access from network: http://staratlasexplorer.duckdns.org:${PORT}\n`);
});

import { rpcMetricsHandler } from './routes/rpc-metrics.js';
app.get('/api/rpc-metrics', rpcMetricsHandler);

import { extractMaterialActionsHandler } from './routes/extract-material-actions.js';
app.post('/api/extract-material-actions', extractMaterialActionsHandler);

import debugSageRouter from './routes/debug-sage.js';
app.use('/api/debug', debugSageRouter);