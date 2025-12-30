import { serializeBreakdown } from '../../src/decoders/serializeBreakdown';
import { SubAccountBreakdown } from '../../src/decoders/scanWalletTxsForSubAccounts';

describe('serializeBreakdown', () => {
  const breakdown: SubAccountBreakdown = {
    fleetKey: 'fleetTest',
    subAccounts: {
      A: { ops: [], totalAmount: 10, count: 1 },
      B: { ops: [], totalAmount: 20, count: 2 },
    },
  };

  it('serializza in JSON', () => {
    const json = serializeBreakdown(breakdown, 'json');
    expect(json).toContain('fleetTest');
    expect(json).toContain('totalAmount');
  });

  it('serializza in CSV', () => {
    const csv = serializeBreakdown(breakdown, 'csv');
    expect(csv).toContain('fleetKey,subAccount,count,totalAmount');
    expect(csv).toContain('fleetTest,A,1,10');
    expect(csv).toContain('fleetTest,B,2,20');
  });

  it('lancia errore su formato non supportato', () => {
    expect(() => serializeBreakdown(breakdown, 'xml' as any)).toThrow();
  });
});
