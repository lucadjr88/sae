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
  // Forza la mappatura sub-account sempre attiva di default
  if (typeof opts.enableSubAccountMapping === 'undefined') {
    opts.enableSubAccountMapping = true;
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
  if (logger) {
    // logger.log(`[DEBUG] Parsed ${items.length} transactions`);
  }
  // 3. Aggregazione minima: raggruppa per programma/operazione e per fleetAccounts se forniti
  const totalFees = items.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  const transactionCount = items.length;

  // NESSUNA AGGREGAZIONE PER OPERAZIONE: solo per fleet

  // feesByFleet: solo aggregazione per fleet, nessun breakdown per tipo
  const feesByFleet: Record<string, any> = {};
  if (Array.isArray(fleetAccounts) && fleetAccounts.length > 0) {
    const accountToFleetMap = opts.enableSubAccountMapping ? buildAccountToFleetMap(fleetAccounts) : null;
    
    // Inizializza solo le fleet che hanno dati (presenti nella mappa)
    for (const f of fleetAccounts) {
      if (accountToFleetMap?.has(f)) {
        feesByFleet[f] = { 
          totalFee: 0, 
          feePercentage: 0, 
          totalOperations: 0, 
          isRented: !!fleetRentalStatus[f], 
          operations: {}, 
          fleetName: (fleetNames && fleetNames[f]) ? fleetNames[f] : f.substring(0,8) 
        };
      }
    }

    if (accountToFleetMap && logger) {
      logger.log(`Built account-to-fleet map with ${accountToFleetMap.size} entries`);
    }
    for (const tx of items) {
      const fleetsMatched = new Set<string>();
      if (Array.isArray(tx.accountKeys)) {
        for (const k of tx.accountKeys) {
          if (accountToFleetMap?.has(k)) {
            const fleetKey = accountToFleetMap.get(k);
            if (fleetKey) fleetsMatched.add(fleetKey);
          } else if (fleetAccounts.includes(k)) {
            fleetsMatched.add(k);
          }
        }
      }
      // Rimosso logica e log per cargo: output deve essere raw
      if (fleetsMatched.size === 0) {
        const key = 'Other Operations';
        if (!feesByFleet[key]) {
          feesByFleet[key] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: false, operations: {}, fleetName: key };
        }
        feesByFleet[key].totalFee += (tx.fee || 0);
        feesByFleet[key].totalOperations = (feesByFleet[key].totalOperations || 0) + 1;
        // Raggruppa per tutte le istruzioni raw
        if (Array.isArray(tx.instructions) && tx.instructions.length > 0) {
          for (const instr of tx.instructions) {
            if (!feesByFleet[key].operations[instr]) {
              feesByFleet[key].operations[instr] = { count: 0, totalFee: 0, details: [] };
            }
            feesByFleet[key].operations[instr].count += 1;
            feesByFleet[key].operations[instr].totalFee += (tx.fee || 0);
            feesByFleet[key].operations[instr].details.push(tx);
          }
        } else {
          const opName = 'Unknown';
          if (!feesByFleet[key].operations[opName]) {
            feesByFleet[key].operations[opName] = { count: 0, totalFee: 0, details: [] };
          }
          feesByFleet[key].operations[opName].count += 1;
          feesByFleet[key].operations[opName].totalFee += (tx.fee || 0);
          feesByFleet[key].operations[opName].details.push(tx);
        }
      } else {
        for (const fleetKey of fleetsMatched) {
          if (!feesByFleet[fleetKey]) {
            feesByFleet[fleetKey] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: !!fleetRentalStatus[fleetKey], operations: {}, fleetName: (fleetNames && fleetNames[fleetKey]) ? fleetNames[fleetKey] : fleetKey };
          }
          feesByFleet[fleetKey].totalFee += (tx.fee || 0);
          feesByFleet[fleetKey].totalOperations = (feesByFleet[fleetKey].totalOperations || 0) + 1;
          // Raggruppa per tutte le istruzioni raw
          if (Array.isArray(tx.instructions) && tx.instructions.length > 0) {
            for (const instr of tx.instructions) {
              if (!feesByFleet[fleetKey].operations[instr]) {
                feesByFleet[fleetKey].operations[instr] = { count: 0, totalFee: 0, details: [] };
              }
              feesByFleet[fleetKey].operations[instr].count += 1;
              feesByFleet[fleetKey].operations[instr].totalFee += (tx.fee || 0);
              feesByFleet[fleetKey].operations[instr].details.push(tx);
            }
          } else {
            const opName = 'Unknown';
            if (!feesByFleet[fleetKey].operations[opName]) {
              feesByFleet[fleetKey].operations[opName] = { count: 0, totalFee: 0, details: [] };
            }
            feesByFleet[fleetKey].operations[opName].count += 1;
            feesByFleet[fleetKey].operations[opName].totalFee += (tx.fee || 0);
            feesByFleet[fleetKey].operations[opName].details.push(tx);
          }
        }
      }
    }
  } else {
    // fallback: tutte le tx in un'unica fleet
    // fallback: tutte le tx in un'unica fleet, raggruppate per istruzione raw
    const operations: Record<string, any> = {};
    for (const tx of items) {
      if (Array.isArray(tx.instructions) && tx.instructions.length > 0) {
        for (const instr of tx.instructions) {
          if (!operations[instr]) {
            operations[instr] = { count: 0, totalFee: 0, details: [] };
          }
          operations[instr].count += 1;
          operations[instr].totalFee += (tx.fee || 0);
          operations[instr].details.push(tx);
        }
      } else {
        const opName = 'Unknown';
        if (!operations[opName]) {
          operations[opName] = { count: 0, totalFee: 0, details: [] };
        }
        operations[opName].count += 1;
        operations[opName].totalFee += (tx.fee || 0);
        operations[opName].details.push(tx);
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

  // finalize percentages
  Object.values(feesByFleet).forEach((f: any) => { f.feePercentage = totalFees > 0 ? (f.totalFee / totalFees) : 0; });

  // DEBUG: logga le chiavi delle operazioni per ogni fleet
  if (logger) {
    Object.entries(feesByFleet).forEach(([fleet, data]) => {
      // logger.log(`[DEBUG][ops] Fleet '${fleet}' operation keys:`, Object.keys(data.operations));
    });
  }



  const result: any = {
    walletPubkey,
    period: 'last24h',
    totalFees24h: totalFees,
    sageFees24h: totalFees,
    transactionCount24h: transactionCount,
    totalSignaturesFetched: transactionCount,
    feesByFleet,
    transactions: items,
    allTransactions: items,
    totalFees,
    transactionCount,
    items,
    partial: false
  };
  return result as any;
}
