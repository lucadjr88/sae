// Aggrega operazioni wallet-txs per sub-account

import fs from 'fs';
import path from 'path';
import { normalizeRawTxToWalletTx } from './normalizeRawTxToWalletTx';

// NB: Usa la definizione WalletTx e OpType centralizzata in OpType.ts
import { WalletTx, OpType } from './OpType';
export interface BreakdownSubAccountOpsParams {
  fleetKey: string;
  subAccounts: string[];
  opType: OpType;
  walletTxsPath: string;
  filter?: (tx: WalletTx) => boolean;
}
export interface SubAccountBreakdown {
  fleetKey: string;
  subAccounts: {
    [subAccount: string]: {
      ops: WalletTx[];
      totalAmount: number;
      count: number;
    }
  };
}

export function scanWalletTxsForSubAccounts(params: BreakdownSubAccountOpsParams): SubAccountBreakdown {
  const { fleetKey, subAccounts, opType, walletTxsPath, filter } = params;
  const breakdown: SubAccountBreakdown = {
    fleetKey,
    subAccounts: {}
  };
  subAccounts.forEach(sa => {
    breakdown.subAccounts[sa] = { ops: [], totalAmount: 0, count: 0 };
  });
  let files: string[] = [];
  try {
    files = fs.readdirSync(walletTxsPath).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error('Errore lettura walletTxsPath:', err);
    return breakdown;
  }
  for (const file of files) {
    try {
      const txRaw = fs.readFileSync(path.join(walletTxsPath, file), 'utf8');
      let tx: WalletTx;
      try {
        // Prova a interpretare come WalletTx già normalizzato
        tx = JSON.parse(txRaw);
        if (!tx.type || !tx.accountKeys) throw new Error('Non normalizzato');
      } catch {
        // Se fallisce, normalizza da raw
        const raw = JSON.parse(txRaw);
        tx = normalizeRawTxToWalletTx(raw);
      }
      if (tx.type !== opType) continue;
      if (filter && !filter(tx)) continue;
      for (const sa of subAccounts) {
        if (tx.accountKeys.includes(sa)) {
          breakdown.subAccounts[sa].ops.push(tx);
          breakdown.subAccounts[sa].totalAmount += tx.amount || 0;
          breakdown.subAccounts[sa].count++;
        }
      }
    } catch (err) {
      console.error('Errore parsing wallet-tx file:', file, err);
    }
  }
  return breakdown;
}
