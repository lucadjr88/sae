// Service entrypoint for walletSageFeesStreaming (stub, orchestrator only)


import type { WalletSageFeesStreamingServices, StreamingOptions, StreamingResult } from './types.js';
import { parseTransaction } from './lib/parsers.js';
import { buildAccountToFleetMap } from './lib/fleet-association.js';
import { extractFleetFromInstruction } from './lib/extract-fleet-official.js';
import { RpcPoolAdapterWithFetch } from '../RpcPoolAdapter';

// Orchestrator reale: fetch, parse, aggrega, metriche base
export async function getWalletSageFeesDetailedStreaming(
  services: WalletSageFeesStreamingServices,
  walletPubkey: string,
  opts: StreamingOptions = {}
): Promise<StreamingResult> {
  // Allinea al debug: sub-account mapping solo se esplicitamente richiesto
  if (typeof opts.enableSubAccountMapping === 'undefined') {
    opts.enableSubAccountMapping = false;
  }
  const { rpcPool, logger, metrics } = services;
  const { fleetAccounts = [], fleetNames = {}, fleetRentalStatus = {} } = opts as any;
  // 1. Fetch transazioni (mock: array vuoto se non implementato)
  let transactions: any[] = [];
  try {
    let fetcher: any = rpcPool;
    // Se l'adapter non ha fetchTransactions, wrappalo
    if (!('fetchTransactions' in rpcPool)) {
      fetcher = new RpcPoolAdapterWithFetch(rpcPool);
    }
    transactions = await fetcher.fetchTransactions(walletPubkey, opts.limit || 100, { 
      hours: (opts && (opts as any).hours) || 24,
      refresh: opts.refresh || (opts as any).update
    });
  } catch (err) {
    if (logger) logger.log('walletSageFeesStreaming: fetch error', err);
    if (metrics) metrics.emit('rpc_error_count', 1);
    return {
      walletPubkey,
      period: 'unknown',
      totalFees: 0,
      transactionCount: 0,
      items: [],
      partial: true,
      errors: [String(err)]
    };
  }
  if (metrics) metrics.emit('items_processed_total', transactions.length);
  // 2. Parsing puro
  const items = transactions.map(parseTransaction);
  const unknownOperations = items.filter(tx => tx.operation === 'Unknown').length;
  if (logger) {
    // logger.log(`[DEBUG] Parsed ${items.length} transactions, ${unknownOperations} unknown`);
  }
  // 3. Aggregazione robusta: per operazione e per fleet
  const totalFees = items.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  const transactionCount = items.length;

  const feesByOperation: Record<string, any> = {};
  for (const tx of items) {
    const opName = tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown');
    if (!feesByOperation[opName]) feesByOperation[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    feesByOperation[opName].count++;
    feesByOperation[opName].totalFee += (tx.fee || 0);
    feesByOperation[opName].avgFee = feesByOperation[opName].totalFee / feesByOperation[opName].count;
    if (tx.signature) feesByOperation[opName].details.push(tx.signature);
  }

  const feesByFleet: Record<string, any> = {};
  if (Array.isArray(fleetAccounts) && fleetAccounts.length > 0) {
    const accountToFleetMap = opts.enableSubAccountMapping ? buildAccountToFleetMap(fleetAccounts) : null;

    if (logger) {
      logger.log(`[DEBUG] fleetAccounts received: ${JSON.stringify(fleetAccounts)}`);
      logger.log(`[DEBUG] accountToFleetMap size: ${accountToFleetMap?.size || 0}`);
    }

    // Pre-initialize fleet slots from accountToFleetMap (only if accountToFleetMap is not empty)
    for (const f of fleetAccounts) {
      if (accountToFleetMap?.has(f)) {
        feesByFleet[f] = {
          totalFee: 0,
          feePercentage: 0,
          totalOperations: 0,
          isRented: !!fleetRentalStatus[f],
          operations: {},
          fleetName: (fleetNames && fleetNames[f]) ? fleetNames[f] : f
        };
      }
    }

    for (const tx of items) {
      const fleetsMatched = new Set<string>();
      const officialFleet = extractFleetFromInstruction((tx as any).raw || tx);
      if (officialFleet && fleetAccounts.includes(officialFleet)) {
        fleetsMatched.add(officialFleet);
      }
      if (fleetsMatched.size === 0 && Array.isArray(tx.accountKeys)) {
        for (const k of tx.accountKeys) {
          if (accountToFleetMap?.has(k)) {
            const fleetKey = accountToFleetMap.get(k);
            if (fleetKey) fleetsMatched.add(fleetKey);
          }
        }
      }

      const opNames = Array.isArray(tx.operation)
        ? tx.operation
        : [tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown')];
      const isCraft = opNames.some((op: unknown) => /craft/i.test(String(op)))
        || (tx.type && /craft/i.test(String(tx.type)))
        || (Array.isArray(tx.programIds) && tx.programIds.some((p: any) => /craft/i.test(String(p))));
      if (isCraft) {
        fleetsMatched.clear();
      }
      const bucketKey = isCraft ? 'Crafting Operations' : 'Other Operations';

      if (fleetsMatched.size === 0) {
        if (!feesByFleet[bucketKey]) {
          feesByFleet[bucketKey] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: false, operations: {}, fleetName: bucketKey };
        }
        const target = feesByFleet[bucketKey];
        target.totalFee += (tx.fee || 0);
        target.totalOperations = (target.totalOperations || 0) + 1;
        for (const opName of opNames) {
          if (!target.operations[opName]) {
            target.operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
          }
          target.operations[opName].count++;
          target.operations[opName].totalFee += (tx.fee || 0);
          target.operations[opName].avgFee = target.operations[opName].totalFee / target.operations[opName].count;
          if (tx.signature) target.operations[opName].details.push(tx.signature);
        }
      } else {
        for (const fleetKey of fleetsMatched) {
          if (!feesByFleet[fleetKey]) {
            feesByFleet[fleetKey] = {
              totalFee: 0,
              feePercentage: 0,
              totalOperations: 0,
              isRented: !!fleetRentalStatus[fleetKey],
              operations: {},
              fleetName: (fleetNames && fleetNames[fleetKey]) ? fleetNames[fleetKey] : fleetKey
            };
          }
          const target = feesByFleet[fleetKey];
          target.totalFee += (tx.fee || 0);
          target.totalOperations = (target.totalOperations || 0) + 1;
          for (const opName of opNames) {
            if (!target.operations[opName]) {
              target.operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
            }
            target.operations[opName].count++;
            target.operations[opName].totalFee += (tx.fee || 0);
            target.operations[opName].avgFee = target.operations[opName].totalFee / target.operations[opName].count;
            if (tx.signature) target.operations[opName].details.push(tx.signature);
          }
        }
      }
    }
  } else {
    // fallback: tutte le tx in un'unica fleet, raggruppate per operazione normalizzata
    const operations: Record<string, any> = {};
    for (const tx of items) {
      const opNames = Array.isArray(tx.operation)
        ? tx.operation
        : [tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown')];
      for (const opName of opNames) {
        if (!operations[opName]) {
          operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
        }
        operations[opName].count++;
        operations[opName].totalFee += (tx.fee || 0);
        operations[opName].avgFee = operations[opName].totalFee / operations[opName].count;
        if (tx.signature) operations[opName].details.push(tx.signature);
      }
    }
    feesByFleet['All Fleets'] = {
      totalFee: totalFees,
      feePercentage: 1,
      totalOperations: transactionCount,
      isRented: false,
      operations,
      fleetName: 'All Fleets'
    };
  }

  Object.values(feesByFleet).forEach((f: any) => { f.feePercentage = totalFees > 0 ? (f.totalFee / totalFees) : 0; });

  const result: any = {
    walletPubkey,
    period: 'last24h',
    totalFees24h: totalFees,
    sageFees24h: totalFees,
    transactionCount24h: transactionCount,
    totalSignaturesFetched: transactionCount,
    feesByFleet,
    feesByOperation,
    transactions: items,
    allTransactions: items,
    totalFees,
    transactionCount,
    unknownOperations,
    items,
    partial: false
  };
  return result as any;
}
