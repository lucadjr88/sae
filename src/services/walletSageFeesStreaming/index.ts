// Service entrypoint for walletSageFeesStreaming (stub, orchestrator only)


import type { WalletSageFeesStreamingServices, StreamingOptions, StreamingResult } from './types';
import { parseTransaction } from './lib/parsers';
import { buildAccountToFleetMap } from './lib/fleet-association';
import { RpcPoolAdapterWithFetch } from '../RpcPoolAdapter';

// Orchestrator reale: fetch, parse, aggrega, metriche base
export async function getWalletSageFeesDetailedStreaming(
  services: WalletSageFeesStreamingServices,
  walletPubkey: string,
  opts: StreamingOptions = {}
): Promise<StreamingResult> {
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
    transactions = await fetcher.fetchTransactions(walletPubkey, opts.limit || 100, { hours: (opts && (opts as any).hours) || 24 });
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
  // 3. Aggregazione minima: raggruppa per programma/operazione e per fleetAccounts se forniti
  const totalFees = items.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  const transactionCount = items.length;

  // feesByOperation: aggregate by first programId if available, fallback to 'Unknown'
  const feesByOperation: Record<string, any> = {};
  for (const tx of items) {
    const opName = tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown');
    if (!feesByOperation[opName]) feesByOperation[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    feesByOperation[opName].count++;
    feesByOperation[opName].totalFee += (tx.fee || 0);
    feesByOperation[opName].avgFee = feesByOperation[opName].totalFee / feesByOperation[opName].count;
    // keep some detail for UX (signature or timestamp)
    if (tx.signature) feesByOperation[opName].details.push(tx.signature);
  }

  // feesByFleet: if specific fleet accounts provided, attribute txs that reference them; else create a catch-all
  const feesByFleet: Record<string, any> = {};
  if (Array.isArray(fleetAccounts) && fleetAccounts.length > 0) {
    // initialize fleets
    for (const f of fleetAccounts) {
      feesByFleet[f] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: !!fleetRentalStatus[f], operations: {}, fleetName: (fleetNames && fleetNames[f]) ? fleetNames[f] : f.substring(0,8) };
    }
    // Build account-to-fleet map if enabled
    const accountToFleetMap = opts.enableSubAccountMapping ? buildAccountToFleetMap(fleetAccounts) : null;
    if (accountToFleetMap && logger) {
      logger.log(`Built account-to-fleet map with ${accountToFleetMap.size} entries`);
    }
    // allocate transactions to matching fleet
    for (const tx of items) {
      let matching: string | undefined;
      if (Array.isArray(tx.accountKeys)) {
        for (const k of tx.accountKeys) {
          if (accountToFleetMap?.has(k)) {
            matching = accountToFleetMap.get(k);
            break;
          } else if (fleetAccounts.includes(k)) {
            matching = k;
            break;
          }
        }
      }
      const key = matching || 'Other Operations';
      if (!feesByFleet[key]) {
        feesByFleet[key] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: !!fleetRentalStatus[key], operations: {}, fleetName: (fleetNames && fleetNames[key]) ? fleetNames[key] : key };
      }
      feesByFleet[key].totalFee += (tx.fee || 0);
      feesByFleet[key].totalOperations = (feesByFleet[key].totalOperations || 0) + 1;
    }
  } else {
    // single catch-all
    feesByFleet['All Fleets'] = { totalFee: totalFees, feePercentage: 1, totalOperations: transactionCount, isRented: false, operations: {}, fleetName: 'All Fleets' };
  }

  // finalize percentages
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
    items,
    partial: false
  };
  return result as any;
}
