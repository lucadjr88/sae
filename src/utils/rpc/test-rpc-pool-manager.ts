// test-rpc-pool-manager.ts
// Test base per RpcPoolManager
import assert from 'node:assert/strict';
import { RpcPoolManager } from './rpc-pool-manager.js';

async function test() {
  const profileId = 'testprofileid';
  console.log('Prune pool...');
  const valid = await RpcPoolManager.ensurePool(undefined, true);
  console.log('Valid endpoints:', valid.length);
  const missingStats = valid.filter((ep: any) => typeof ep?.pruned !== 'number' || typeof ep?.total !== 'number');
  assert.equal(missingStats.length, 0, `Missing prune stats on endpoints: ${missingStats.map((ep: any) => ep?.name || ep?.url).join(', ')}`);

  console.log('Load or create pool...');
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  console.log('Loaded pool:', pool.length);

  console.log('Pick connection...');
  const { connection, endpoint, release } = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
  console.log('Picked endpoint:', endpoint.name, endpoint.url);
  try {
    const slot = await connection.getSlot('processed');
    console.log('Slot:', slot);
    release({ success: true, latencyMs: 100 });
  } catch (e) {
    console.log('RPC error:', e);
    release({ success: false });
  }
}

test().catch(console.log);
