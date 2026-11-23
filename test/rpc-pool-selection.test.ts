import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  pickRpcConnection,
  resetPoolCache,
} from '../src/utils/rpc/rpc-pool-manager';
import * as health from '../src/utils/rpc/health-manager';
import * as concurrency from '../src/utils/rpc/concurrency-manager';

const first = 'https://first.example';
const second = 'https://second.example';

test('invalid cached endpoints are excluded from selection', async (t) => {
  t.mock.method(fs, 'readFile', async () => JSON.stringify([
    { plrProfile_total: 1 },
    { url: 'not-a-url' },
    { url: first },
  ]) as any);
  resetPoolCache('pool-invalid-test');
  health.resetHealthMap();
  concurrency.resetConcurrencyMap();
  const pick = await pickRpcConnection('pool-invalid-test');
  assert.equal(pick.endpoint.url, first);
  pick.release({ success: true });
  resetPoolCache('pool-invalid-test');
});

test('waiting selection sees endpoints that recover during the wait', async (t) => {
  t.mock.method(fs, 'readFile', async () => JSON.stringify([
    { url: first, maxConcurrent: 1 },
    { url: second, maxConcurrent: 1 },
  ]) as any);
  resetPoolCache('pool-wait-test');
  health.resetHealthMap();
  concurrency.resetConcurrencyMap();
  health.recordFailure(first);
  assert.equal(concurrency.acquire(second, 1), true);
  const timer = setTimeout(() => health.recordSuccess(first), 50);
  try {
    const pick = await pickRpcConnection('pool-wait-test', { waitForMs: 500 });
    assert.equal(pick.endpoint.url, first);
    pick.release({ success: true });
  } finally {
    clearTimeout(timer);
    concurrency.release(second);
    resetPoolCache('pool-wait-test');
  }
});

test('403 temporarily excludes an endpoint even for stale selections', async (t) => {
  t.mock.method(fs, 'readFile', async () => JSON.stringify([{ url: first }, { url: second }]) as any);
  resetPoolCache('pool-forbidden-test');
  health.resetHealthMap();
  concurrency.resetConcurrencyMap();
  const denied = await pickRpcConnection('pool-forbidden-test');
  denied.release({ success: false, errorType: '403' });
  assert.equal(health.isForbidden(denied.endpoint.url), true);
  health.recordSuccess(denied.endpoint.url);
  health.resetHealthMap(true);
  const next = await pickRpcConnection('pool-forbidden-test', { allowStale: true });
  assert.notEqual(next.endpoint.url, denied.endpoint.url);
  next.release({ success: true });
  resetPoolCache('pool-forbidden-test');
  health.resetHealthMap();
});
