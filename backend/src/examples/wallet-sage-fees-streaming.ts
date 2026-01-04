import { TransactionInfo } from './types.js';
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { resolveMints } from '../utils/metaplex-metadata.js';
import { nlog } from '../utils/log-normalizer.js';
import { excludeAccounts, MATERIALS, BATCH_SETTINGS, buildFleetMaps, filterFleetBuckets } from '../config/wallet-fees-streaming-config.js';
import { fetchWalletSignatures } from '../services/fetch-wallet-signatures.js';
import { classifyTx } from '../decoders/streaming/tx-classifier.js';
import { enrichCrafting } from '../services/crafting-enricher.js';
import { accumulate, finalize, pairCraftingTransactions } from '../services/fees-aggregator.js';
import { buildPartialResult, sendProgressUpdate } from '../services/progress-reporter.js';

export async function getWalletSageFeesDetailedStreaming(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  fleetRentalStatus: { [account: string]: boolean } = {},
  hours: number = 24,
  enableSubAccountMapping: boolean = false,
  sendUpdate: (data: any) => void,
  saveProgress?: (partialResult: any) => Promise<void>,
  cachedData?: any,
  lastProcessedSignature?: string,
  refresh: boolean = false
): Promise<any> {
  // --- LOGICA LEGACY ADATTATA ALLA MODULARIZZAZIONE ---
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';

  // Build fleet maps
  const { allowedFleetKeys, accountToFleet, resolveFleetKey } = buildFleetMaps(fleetAccounts, fleetAccountNames, enableSubAccountMapping);

  const now = Date.now();
  const cutoffTime = now - (hours * 60 * 60 * 1000);
  const CRAFT_PROGRAM_ID = 'CRAFT2RPXPJWCEix4WpJST3E7NLf79GTqZUL75wngXo5';
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Parametri batch e rate limiting
  const BATCH_SIZE = BATCH_SETTINGS.batchSize;
  const MAX_TRANSACTIONS = 3000;
  const MIN_DELAY = BATCH_SETTINGS.minDelay;
  const MAX_DELAY = BATCH_SETTINGS.maxDelay;
  const BACKOFF_MULTIPLIER = BATCH_SETTINGS.backoffMultiplier;
  const SUCCESS_PROBE_WINDOW = BATCH_SETTINGS.successProbeWindow;
  const SUCCESS_DECREASE_STEP = BATCH_SETTINGS.successDecreaseStep;
  const JITTER_PCT = BATCH_SETTINGS.jitterPct;
  const MAX_RETRIES = BATCH_SETTINGS.maxRetries;
  let currentDelay = MIN_DELAY;
  let successStreak = 0;
  let consecutiveErrors = 0;

  // Gestione incrementale/cache
  let isIncrementalUpdate = !!(cachedData && lastProcessedSignature);
  if (refresh) isIncrementalUpdate = false; // Forza ricalcolo completo per refresh
  let feesByFleet: any = isIncrementalUpdate && cachedData ? { ...cachedData.feesByFleet } : {};
  let feesByOperation: any = isIncrementalUpdate && cachedData ? { ...cachedData.feesByOperation } : {};
  let totalFees24h = isIncrementalUpdate && cachedData ? (cachedData.totalFees24h || 0) : 0;
  let sageFees24h = isIncrementalUpdate && cachedData ? (cachedData.sageFees24h || 0) : 0;
  let unknownOperations = 0;
  let processedTransactions: TransactionInfo[] = [];
  const rentedFleets = new Set<string>();
  const cacheSavePromises: Promise<void>[] = [];

  // Aggregator state
  const aggregatorState = {
    feesByFleet,
    feesByOperation,
    totalFees24h,
    sageFees24h,
    processedTransactions,
    unknownOperations,
  };

  // Create a single reusable RPC pool connection for crafting details
  const sharedPoolConnection = new RpcPoolConnection(connection);

  // Fetch signatures
  const { transactions: allTransactions, totalSignaturesFetched: totalSigs } = await fetchWalletSignatures({
    rpcEndpoint,
    rpcWebsocket,
    wallet: walletPubkey,
    cutoffTime,
    batchSize: MAX_TRANSACTIONS,
    maxTx: MAX_TRANSACTIONS,
    maxRetries: 3,
    sendUpdate,
  });

  // Fase 2: Batch processing e parsing avanzato
  for (let i = 0; i < allTransactions.length; i += BATCH_SIZE) {
    const batch = allTransactions.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();

    for (const tx of batch) {
      // Classify transaction
      const meta = classifyTx(tx, {
        accountToFleet,
        resolveFleetKey,
        excludeAccounts,
        MATERIALS,
        SAGE_PROGRAM_ID,
        fleetAccountNames,
      });

      // Skip non-SAGE transactions
      if (meta.operation === 'Non-SAGE') continue;

      // Optional crafting enrichment
      let craftExtra = {};
      if (meta.isCrafting) {
        try {
          craftExtra = await enrichCrafting(tx, {
            sharedPoolConnection,
            resolveMints,
            CRAFT_PROGRAM_ID,
          });
        } catch (e) {
          // Silent fallback
        }
      }

      // Accumulate
      accumulate(tx, meta, craftExtra, aggregatorState, fleetRentalStatus, fleetAccountNames);
    }

    // Dopo aver processato il batch, aggiorna il totale operazioni per ogni flotta
    Object.values(aggregatorState.feesByFleet).forEach(fleetData => {
      const ops = Object.values((fleetData as any).operations) as any[];
      (fleetData as any).totalOperations = ops.reduce((sum, op) => sum + (op.count || 0), 0);
    });

    // Aggiornamento percentuali
    Object.keys(aggregatorState.feesByOperation).forEach(op => {
      aggregatorState.feesByOperation[op].avgFee = aggregatorState.feesByOperation[op].totalFee / aggregatorState.feesByOperation[op].count;
    });
    Object.keys(aggregatorState.feesByFleet).forEach(fleet => {
      aggregatorState.feesByFleet[fleet].feePercentage = aggregatorState.sageFees24h > 0 ? (aggregatorState.feesByFleet[fleet].totalFee / aggregatorState.sageFees24h) * 100 : 0;

      Object.keys(aggregatorState.feesByFleet[fleet].operations).forEach(op => {
        const opData = aggregatorState.feesByFleet[fleet].operations[op];
        opData.avgFee = opData.totalFee / opData.count;
        opData.percentageOfFleet = aggregatorState.feesByFleet[fleet].totalFee > 0 ? (opData.totalFee / aggregatorState.feesByFleet[fleet].totalFee) * 100 : 0;
      });
    });

    // Log sintetici per crafting details phase
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const processedInBatch = Math.min(BATCH_SIZE, allTransactions.length - i);
    const totalProcessedSoFar = Math.min(i + BATCH_SIZE, allTransactions.length);
    const remainingTxs = allTransactions.length - totalProcessedSoFar;
    const batchTimeElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
    const txPerSec = processedInBatch > 0 ? (processedInBatch / (Number(batchTimeElapsed) || 1)).toFixed(1) : '0.0';
    const sageOpCount = aggregatorState.processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID)).length;
    const craftingOpCount = Object.keys(aggregatorState.feesByOperation).includes('Crafting') ? aggregatorState.feesByOperation['Crafting'].count : 0;

    nlog(`[crafting-details] Batch ${batchNum}: processed ${processedInBatch} tx in ${batchTimeElapsed}s (${txPerSec} tx/s), remaining: ${remainingTxs}, SAGE ops: ${sageOpCount}, Crafting ops: ${craftingOpCount}`);

    // Build partial result per batch
    const partialResult = buildPartialResult({
      i,
      batchSize: BATCH_SIZE,
      totalTxs: allTransactions.length,
      totals: {
        totalFees24h: aggregatorState.totalFees24h,
        sageFees24h: aggregatorState.sageFees24h,
        unknownOperations: aggregatorState.unknownOperations,
      },
      feesByFleet: aggregatorState.feesByFleet,
      feesByOperation: aggregatorState.feesByOperation,
      wallet: walletPubkey,
      hours,
      delay: currentDelay,
      rentalStatus: fleetRentalStatus,
      fleetNames: fleetAccountNames,
      processedTransactions: aggregatorState.processedTransactions,
      totalSigs,
      batchTimeElapsed,
      txPerSec,
      allowedFleetKeys,
    });

    await sendProgressUpdate(partialResult, sendUpdate, saveProgress);
    if (saveProgress) {
      const cachePromise = saveProgress(partialResult).catch(err => {
        console.error('[stream] Incremental cache save failed:', err);
      });
      cacheSavePromises.push(cachePromise);
    }
    await new Promise(resolve => setTimeout(resolve, currentDelay));
  }
  // Attendi salvataggio cache
  if (cacheSavePromises.length > 0) {
    await Promise.all(cacheSavePromises);
  }

  // Pair crafting transactions
  aggregatorState.processedTransactions = pairCraftingTransactions(aggregatorState.processedTransactions);

  // Finalize aggregator
  finalize(aggregatorState);

  // Aggregazione e ordinamento finale
  aggregatorState.processedTransactions.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
  const sageTransactions = aggregatorState.processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID));
  const finalResult = {
    type: 'complete',
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h: aggregatorState.totalFees24h,
    sageFees24h: aggregatorState.sageFees24h,
    transactionCount24h: sageTransactions.length,
    totalSignaturesFetched: totalSigs,
    feesByFleet: filterFleetBuckets(aggregatorState.feesByFleet, allowedFleetKeys),
    feesByOperation: aggregatorState.feesByOperation,
    transactions: aggregatorState.processedTransactions,
    unknownOperations: sageTransactions.filter(t => (t as any).operation === 'Unknown').length,
    rentedFleetAccounts: Object.keys(fleetRentalStatus).filter(k => fleetRentalStatus[k]),
    fleetAccountNamesEcho: fleetAccountNames,
    fleetRentalStatusFinal: fleetRentalStatus
  };
  //console.log('Final feesByFleet:', JSON.stringify(feesByFleet, null, 2));
  sendUpdate(finalResult);
  return finalResult;
}
