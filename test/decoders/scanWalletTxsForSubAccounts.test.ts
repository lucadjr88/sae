import { scanWalletTxsForSubAccounts, BreakdownSubAccountOpsParams } from '../../src/decoders/scanWalletTxsForSubAccounts';
import { WalletTx } from '../../src/decoders/OpType';
import fs from 'fs';
import path from 'path';

describe('scanWalletTxsForSubAccounts', () => {
  const walletTxsPath = 'cache/wallet-txs/mock';
  const subAccounts = ['A', 'B'];
  const fleetKey = 'fleetTest';
  const opType = 'cargo';

  beforeAll(() => {
    if (!fs.existsSync(walletTxsPath)) fs.mkdirSync(walletTxsPath, { recursive: true });
    const txs: WalletTx[] = [
      { accountKeys: ['A'], amount: 10, type: 'cargo', timestamp: '2025-01-01T00:00:00Z' },
      { accountKeys: ['B'], amount: 20, type: 'cargo', timestamp: '2025-01-02T00:00:00Z' },
      { accountKeys: ['A', 'B'], amount: 5, type: 'cargo', timestamp: '2025-01-03T00:00:00Z' },
      { accountKeys: ['C'], amount: 99, type: 'fees', timestamp: '2025-01-04T00:00:00Z' },
    ];
    txs.forEach((tx, i) => {
      fs.writeFileSync(path.join(walletTxsPath, `tx${i}.json`), JSON.stringify(tx), 'utf8');
    });
  });

  afterAll(() => {
    fs.readdirSync(walletTxsPath).forEach(f => fs.unlinkSync(path.join(walletTxsPath, f)));
    fs.rmdirSync(walletTxsPath);
  });

  it('aggregazione corretta per subAccounts e opType', () => {
    const params: BreakdownSubAccountOpsParams = {
      fleetKey,
      subAccounts,
      opType,
      walletTxsPath,
    };
    const breakdown = scanWalletTxsForSubAccounts(params);
    expect(breakdown.subAccounts['A'].totalAmount).toBe(15);
    expect(breakdown.subAccounts['A'].count).toBe(2);
    expect(breakdown.subAccounts['B'].totalAmount).toBe(25);
    expect(breakdown.subAccounts['B'].count).toBe(2);
  });

  it('filtro custom su amount', () => {
    const params: BreakdownSubAccountOpsParams = {
      fleetKey,
      subAccounts,
      opType,
      walletTxsPath,
      filter: (tx) => (tx.amount ?? 0) > 10
    };
    const breakdown = scanWalletTxsForSubAccounts(params);
    expect(breakdown.subAccounts['A'].totalAmount).toBe(0);
    expect(breakdown.subAccounts['A'].count).toBe(0);
    expect(breakdown.subAccounts['B'].totalAmount).toBe(20);
    expect(breakdown.subAccounts['B'].count).toBe(1);
  });

  it('ignora opType non corrispondente', () => {
    const params: BreakdownSubAccountOpsParams = {
      fleetKey,
      subAccounts,
      opType: 'fees',
      walletTxsPath,
    };
    const breakdown = scanWalletTxsForSubAccounts(params);
    expect(breakdown.subAccounts['A'].totalAmount).toBe(0);
    expect(breakdown.subAccounts['A'].count).toBe(0);
    expect(breakdown.subAccounts['B'].totalAmount).toBe(0);
    expect(breakdown.subAccounts['B'].count).toBe(0);
  });
});
