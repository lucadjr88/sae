import { PartialResult } from '../types/wallet-fees-streaming-types';
import { filterFleetBuckets } from '../config/wallet-fees-streaming-config';

export function buildPartialResult(opts: {
  i: number;
  batchSize: number;
  totalTxs: number;
  totals: { totalFees24h: number; sageFees24h: number; unknownOperations: number };
  feesByFleet: any;
  feesByOperation: any;
  wallet: string;
  hours: number;
  delay: number;
  rentalStatus: { [account: string]: boolean };
  fleetNames: { [account: string]: string };
  processedTransactions: any[];
  totalSigs: number;
  batchTimeElapsed: string;
  txPerSec: string;
  allowedFleetKeys: Set<string>;
}): PartialResult {
  const {
    i,
    batchSize,
    totalTxs,
    totals,
    feesByFleet,
    feesByOperation,
    wallet,
    hours,
    delay,
    rentalStatus,
    fleetNames,
    processedTransactions,
    totalSigs,
    batchTimeElapsed,
    txPerSec,
    allowedFleetKeys,
  } = opts;

  const batchNum = Math.floor(i / batchSize) + 1;
  const processedInBatch = Math.min(batchSize, totalTxs - i);
  const totalProcessedSoFar = Math.min(i + batchSize, totalTxs);
  const remainingTxs = totalTxs - totalProcessedSoFar;
  const sageOpCount = processedTransactions.filter(t => t.programIds.includes('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE')).length;

  return {
    type: 'progress',
    stage: 'transactions',
    message: `Processing batch ${batchNum} (${txPerSec} tx/s, delay: ${delay}ms)`,
    processed: totalProcessedSoFar,
    total: totalSigs,
    percentage: ((totalProcessedSoFar / totalSigs) * 100).toFixed(1),
    batchTime: batchTimeElapsed,
    currentDelay: delay,
    walletAddress: wallet,
    period: `Last ${hours} hours`,
    totalFees24h: totals.totalFees24h,
    sageFees24h: totals.sageFees24h,
    transactionCount24h: sageOpCount,
    totalSignaturesFetched: totalSigs,
    feesByFleet: filterFleetBuckets({ ...feesByFleet }, allowedFleetKeys),
    feesByOperation: { ...feesByOperation },
    unknownOperations: totals.unknownOperations,
    rentedFleetAccounts: Object.keys(rentalStatus).filter(k => rentalStatus[k]),
    fleetAccountNamesEcho: fleetNames,
    fleetRentalStatusFinal: rentalStatus,
  };
}

export async function sendProgressUpdate(
  partialResult: PartialResult,
  sendUpdate: (data: any) => void,
  saveProgress?: (partialResult: any) => Promise<void>
): Promise<void> {
  sendUpdate(partialResult);
  if (saveProgress) {
    await saveProgress(partialResult).catch(err => {
      console.error('[stream] Incremental cache save failed:', err);
    });
  }
}