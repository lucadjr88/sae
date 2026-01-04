import { normalizeRawTxToWalletTx } from './normalizeRawTxToWalletTx.js';
import { WalletTx } from './OpType.js';

describe('normalizeRawTxToWalletTx', () => {
  it('normalizza una tx cargo', () => {
    const rawTx = {
      transaction: {
        message: {
          instructions: [
            { programId: 'Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk' }
          ],
          accountKeys: ['A', 'B', 'C']
        },
        signatures: ['sig1']
      },
      blockTime: 123456
    };
    const tx: WalletTx = normalizeRawTxToWalletTx(rawTx);
    expect(tx.type).toBe('cargo');
    expect(tx.accountKeys).toContain('A');
    expect(tx.txid).toBe('sig1');
    expect(tx.timestamp).toBe('123456');
  });

  it('normalizza una tx subwarp', () => {
    const rawTx = {
      transaction: {
        message: {
          instructions: [
            { programId: 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE' }
          ],
          accountKeys: ['X', 'Y']
        },
        signatures: ['sig2']
      },
      blockTime: 999
    };
    const tx: WalletTx = normalizeRawTxToWalletTx(rawTx);
    expect(tx.type).toBe('subwarp');
    expect(tx.accountKeys).toContain('X');
    expect(tx.txid).toBe('sig2');
    expect(tx.timestamp).toBe('999');
  });

  it('normalizza una tx mining', () => {
    const rawTx = {
      transaction: {
        message: {
          instructions: [
            { programId: 'Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM' }
          ],
          accountKeys: ['M']
        },
        signatures: ['sig3']
      }
    };
    const tx: WalletTx = normalizeRawTxToWalletTx(rawTx);
    expect(tx.type).toBe('mining');
    expect(tx.accountKeys).toContain('M');
    expect(tx.txid).toBe('sig3');
  });

  it('normalizza una tx con programId sconosciuto', () => {
    const rawTx = {
      transaction: {
        message: {
          instructions: [
            { programId: 'UnknownProgramId' }
          ],
          accountKeys: ['Z']
        },
        signatures: ['sig4']
      }
    };
    const tx: WalletTx = normalizeRawTxToWalletTx(rawTx);
    expect(tx.type).toBe('altro');
    expect(tx.accountKeys).toContain('Z');
    expect(tx.txid).toBe('sig4');
  });

  it('gestisce raw tx corrotta', () => {
    expect(() => normalizeRawTxToWalletTx(null)).toThrow();
    expect(() => normalizeRawTxToWalletTx(undefined)).toThrow();
    expect(() => normalizeRawTxToWalletTx(42)).toThrow();
  });
});
