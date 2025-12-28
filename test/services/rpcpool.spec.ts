import { describe, it, expect, vi } from 'vitest';
import { RpcPoolAdapter } from '../../src/services/RpcPoolAdapter';

import * as rpcPoolManager from '../../src/utils/rpc/rpc-pool-manager';

describe('RpcPoolAdapter', () => {
  it('calls underlying pool methods', async () => {
    const mockPool = {
      pickNextRpc: vi.fn().mockReturnValue({ index: 1 }),
      tryAcquireRpc: vi.fn().mockReturnValue(true),
      releaseRpc: vi.fn(),
      getRpcMetrics: vi.fn().mockReturnValue({})
    };
    vi.spyOn(rpcPoolManager, 'getGlobalRpcPoolManager').mockReturnValue(mockPool);
    const adapter = new RpcPoolAdapter();
    expect(await adapter.pick()).toBe(1);
    await adapter.acquire(1);
    await adapter.release(1, { success: true });
    expect(adapter.getMetrics()).toEqual({});
  });
});
