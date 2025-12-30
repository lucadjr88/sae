import { getSubAccountsForFleet } from '../../src/decoders/getSubAccountsForFleet';
import { scanWalletTxsForSubAccounts } from '../../src/decoders/scanWalletTxsForSubAccounts';
import { serializeBreakdown } from '../../src/decoders/serializeBreakdown';
import { OpType } from '../../src/decoders/OpType';
import fs from 'fs';
import path from 'path';

describe('Pipeline end-to-end breakdown sub-account', () => {
  const fleetKey = 'fleetTest';
  const cacheDir = 'cache/fleets';
  const walletTxsPath = 'cache/wallet-txs/mockPipeline';

  beforeAll(() => {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, `${fleetKey}.json`), JSON.stringify({ subAccounts: ['A', 'B'] }), 'utf8');
    if (!fs.existsSync(walletTxsPath)) fs.mkdirSync(walletTxsPath, { recursive: true });
    const txs = [
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
    fs.unlinkSync(path.join(cacheDir, `${fleetKey}.json`));
    fs.readdirSync(walletTxsPath).forEach(f => fs.unlinkSync(path.join(walletTxsPath, f)));
    fs.rmdirSync(walletTxsPath);
  });

  it('pipeline breakdown + serializzazione', () => {
    const subAccounts = getSubAccountsForFleet(fleetKey, cacheDir);
    const breakdown = scanWalletTxsForSubAccounts({
      fleetKey,
      subAccounts,
      opType: 'cargo',
      walletTxsPath,
      filter: (tx) => (tx.amount ?? 0) > 0
    });
    const outputJson = serializeBreakdown(breakdown, 'json');
    const outputCsv = serializeBreakdown(breakdown, 'csv');
    expect(outputJson).toContain('fleetTest');
    expect(outputCsv).toContain('fleetKey,subAccount,count,totalAmount');
    expect(outputCsv).toContain('fleetTest,A,2,15');
    expect(outputCsv).toContain('fleetTest,B,2,25');
  });
});
