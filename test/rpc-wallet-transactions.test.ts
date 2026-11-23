import assert from 'node:assert/strict';
import test from 'node:test';
import { RpcPoolManager } from '../src/utils/rpc/rpc-pool-manager';
import { fetchWalletTransactions } from '../src/utils/solanaRpc';

const wallet = '11111111111111111111111111111111';
const endpoints = [{ url: 'https://first.example' }, { url: 'https://second.example' }];

test('signature lookup falls back after a forbidden endpoint', async () => {
  const load = RpcPoolManager.loadOrCreateRpcPool;
  const pick = RpcPoolManager.pickRpcConnection;
  const attempted: string[] = [];
  const errors: string[] = [];
  RpcPoolManager.loadOrCreateRpcPool = async () => endpoints;
  RpcPoolManager.pickRpcConnection = async (_profileId, opts) => {
    const endpoint = endpoints.find(ep => !opts?.excludeUrls?.has(ep.url)) ?? endpoints[0];
    attempted.push(endpoint.url);
    return {
      endpoint,
      release: result => { if (result?.errorType) errors.push(result.errorType); },
      connection: {
        getSignaturesForAddress: async () => {
          if (endpoint === endpoints[0]) throw new Error('403 Forbidden');
          return [];
        },
      },
    };
  };
  try {
    const result = await fetchWalletTransactions(wallet, Date.now() - 86400000, 'profile');
    assert.deepEqual(attempted, endpoints.map(ep => ep.url));
    assert.deepEqual(errors, ['403']);
    assert.deepEqual(result, { txs: [], total: 0, failed: [] });
  } finally {
    RpcPoolManager.loadOrCreateRpcPool = load;
    RpcPoolManager.pickRpcConnection = pick;
  }
});

test('signature lookup reports exhaustion instead of returning zero transactions', async () => {
  const load = RpcPoolManager.loadOrCreateRpcPool;
  const pick = RpcPoolManager.pickRpcConnection;
  RpcPoolManager.loadOrCreateRpcPool = async () => endpoints;
  RpcPoolManager.pickRpcConnection = async () => ({
    endpoint: endpoints[0],
    release: () => {},
    connection: { getSignaturesForAddress: async () => { throw new Error('403 Forbidden'); } },
  });
  try {
    await assert.rejects(
      fetchWalletTransactions(wallet, Date.now() - 86400000, 'profile'),
      /getSignaturesForAddress failed/,
    );
  } finally {
    RpcPoolManager.loadOrCreateRpcPool = load;
    RpcPoolManager.pickRpcConnection = pick;
  }
});

test('transaction lookup retries a forbidden endpoint on another RPC', async () => {
  const load = RpcPoolManager.loadOrCreateRpcPool;
  const pick = RpcPoolManager.pickRpcConnection;
  const attempted: string[] = [];
  RpcPoolManager.loadOrCreateRpcPool = async () => endpoints;
  RpcPoolManager.pickRpcConnection = async (_profileId, opts) => {
    const endpoint = endpoints.find(ep => !opts?.excludeUrls?.has(ep.url)) ?? endpoints[0];
    attempted.push(endpoint.url);
    return {
      endpoint,
      release: () => {},
      connection: {
        getTransaction: async () => {
          if (endpoint === endpoints[0]) throw new Error('403 Forbidden');
          return { slot: 1 };
        },
      },
    };
  };
  try {
    const result = await fetchWalletTransactions(wallet, Date.now() - 86400000, 'profile', ['signature']);
    assert.deepEqual(attempted, endpoints.map(ep => ep.url));
    assert.equal(result.txs.length, 1);
    assert.deepEqual(result.failed, []);
  } finally {
    RpcPoolManager.loadOrCreateRpcPool = load;
    RpcPoolManager.pickRpcConnection = pick;
  }
});
