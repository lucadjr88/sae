// test-rpc-pool-manager.ts
// Test base per RpcPoolManager
import { RpcPoolManager } from './rpc-pool-manager';

async function test() {
  const profileId = 'testprofileid';
  console.log('Prune pool...');
  const valid = await RpcPoolManager.ensurePool(undefined, true);
  console.log('Valid endpoints:', valid.length);

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
    console.error('RPC error:', e);
    release({ success: false });
  }
}

test().catch(console.error);
