import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

const mockServices = {
  rpcPool: { fetchTransactions: async () => [] },
  OP_MAP: {},
  SAGE_PROGRAM_ID: 'SAGE123',
};

describe('SMOKE /api/wallet/sage-fees-stream', () => {
  it('should return 200 and valid shape', async () => {
    const app = createApp({ services: mockServices });
    const res = await request(app)
      .post('/api/wallet/sage-fees-stream')
      .send({ walletPubkey: 'wallet1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
