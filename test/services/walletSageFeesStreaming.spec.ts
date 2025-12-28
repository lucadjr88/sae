import { describe, it, expect, vi } from 'vitest';
import { getWalletSageFeesDetailedStreaming } from '../../services/walletSageFeesStreaming/index.js';

const mockServices = {
  rpcPool: { fetchTransactions: vi.fn().mockResolvedValue([]) },
  OP_MAP: {},
  SAGE_PROGRAM_ID: 'SAGE123',
};

describe('getWalletSageFeesDetailedStreaming', () => {
  it('should return empty summary and items for no transactions', async () => {
    const result = await getWalletSageFeesDetailedStreaming(mockServices, 'wallet1', {});
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(0);
  });
});
