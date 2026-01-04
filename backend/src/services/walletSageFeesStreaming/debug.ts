import { getWalletSageFeesDetailedStreaming } from './index.js';
import type { WalletSageFeesStreamingServices } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { parseTransaction } from './lib/parsers.js';
import { extractFleetFromInstruction } from './lib/extract-fleet-official.js';

/**
 * API di debug: restituisce la struttura feesByFleet completa (raw breakdown)
 * @param services dipendenze backend
 * @param walletPubkey chiave pubblica wallet
 * @param opts opzioni streaming (fleetAccounts, fleetNames, ecc)
 * @returns feesByFleet raw breakdown
 */
export async function debugFleetBreakdown(
  services: WalletSageFeesStreamingServices,
  walletPubkey: string,
  opts: any = {}
) {
  // For debug, read from cache instead of fetching live
  const cacheDir = path.resolve('../cache/wallet-txs', walletPubkey);
  const transactions: any[] = [];

  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const file of files.slice(0, 100)) { // Limit to 100 for debug
        try {
          const txData = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
          transactions.push(txData.data);
        } catch (e) {
          // Skip corrupted files
        }
      }
    }
  } catch (err) {
    if (services.logger) services.logger.log('[debugFleetBreakdown] Error reading cache:', err);
  }

  // Process transactions using the same logic as streaming
  const items = transactions.map(parseTransaction);
  const { fleetAccounts = [], fleetNames = {}, fleetRentalStatus = {} } = opts as any;

  if (services.logger) {
    services.logger.log(`[debugFleetBreakdown] Read ${transactions.length} transactions from cache`);
    services.logger.log(`[debugFleetBreakdown] Fleet accounts: ${JSON.stringify(fleetAccounts)}`);
  }

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

  // feesByFleet: robusto, sempre tutte le fleet reali, mapping completo, aggregazione op normalizzate
  const feesByFleet: Record<string, any> = {};
  const totalFees = items.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  const transactionCount = items.length;

  if (Array.isArray(fleetAccounts) && fleetAccounts.length > 0) {
    // Build mapping completo account→fleet
    const accountToFleetMap = opts.enableSubAccountMapping ? buildAccountToFleetMap(fleetAccounts) : null;
    
    // 1. Inizializza solo le fleet reali che hanno dati
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

    if (accountToFleetMap && services.logger) {
      services.logger.log(`Built account-to-fleet map with ${accountToFleetMap.size} entries`);
      // Log specific mappings for Rainbow Cargo
      const rainbowCargoKey = '7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5';
      if (accountToFleetMap.has(rainbowCargoKey)) {
        // services.logger.log(`[DEBUG] Rainbow Cargo main account mapped: ${rainbowCargoKey}`);
      }
      // Log all mappings for Rainbow Cargo
      for (const [account, fleet] of accountToFleetMap.entries()) {
        if (fleet === rainbowCargoKey) {
          // services.logger.log(`[DEBUG] Rainbow Cargo sub-account: ${account} -> ${fleet}`);
        }
      }
    }
    // 2. Per ogni transazione, trova tutte le fleet coinvolte
    for (const tx of items) {
      const fleetsMatched = new Set<string>();
      // 1. Prova logica ufficiale (Mining/Scan/SDU)
      const officialFleet = extractFleetFromInstruction(tx.raw);
      if (officialFleet && fleetAccounts.includes(officialFleet)) {
        fleetsMatched.add(officialFleet);
      } else if (Array.isArray(tx.accountKeys)) {
        // 2. Solo account mappati esplicitamente alla fleet (evita match falsi)
        for (const k of tx.accountKeys) {
          if (accountToFleetMap?.has(k)) {
            const fleetKey = accountToFleetMap.get(k);
            if (fleetKey) fleetsMatched.add(fleetKey);
          }
        }
      }

      // 3. Aggrega tutte le op normalizzate per OGNI fleet coinvolta
      const opNames = Array.isArray(tx.operation)
        ? tx.operation
        : [tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown')];


      if (fleetsMatched.size === 0) {
        // fallback: Other Operations (o Crafting dedicato)
        const key = 'Other Operations';
        if (!feesByFleet[key]) {
          feesByFleet[key] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: false, operations: {}, fleetName: key };
        }
        feesByFleet[key].totalFee += (tx.fee || 0);
        feesByFleet[key].totalOperations = (feesByFleet[key].totalOperations || 0) + 1;
        for (const opName of opNames) {
          if (!feesByFleet[key].operations[opName]) {
            feesByFleet[key].operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
          }
          feesByFleet[key].operations[opName].count++;
          feesByFleet[key].operations[opName].totalFee += (tx.fee || 0);
          feesByFleet[key].operations[opName].avgFee = feesByFleet[key].operations[opName].totalFee / feesByFleet[key].operations[opName].count;
          if (tx.signature) feesByFleet[key].operations[opName].details.push(tx.signature);
        }
      } else {
        for (const fleetKey of fleetsMatched) {
          if (!feesByFleet[fleetKey]) {
            feesByFleet[fleetKey] = { totalFee: 0, feePercentage: 0, totalOperations: 0, isRented: !!fleetRentalStatus[fleetKey], operations: {}, fleetName: (fleetNames && fleetNames[fleetKey]) ? fleetNames[fleetKey] : fleetKey };
          }
          feesByFleet[fleetKey].totalFee += (tx.fee || 0);
          feesByFleet[fleetKey].totalOperations = (feesByFleet[fleetKey].totalOperations || 0) + 1;
          for (const opName of opNames) {
            if (!feesByFleet[fleetKey].operations[opName]) {
              feesByFleet[fleetKey].operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
            }
            feesByFleet[fleetKey].operations[opName].count++;
            feesByFleet[fleetKey].operations[opName].totalFee += (tx.fee || 0);
            feesByFleet[fleetKey].operations[opName].avgFee = feesByFleet[fleetKey].operations[opName].totalFee / feesByFleet[fleetKey].operations[opName].count;
            if (tx.signature) feesByFleet[fleetKey].operations[opName].details.push(tx.signature);
          }
        }
      }
    }
    // 4. Coerenza: tutte le op usate in almeno una fleet vanno aggiunte (con count 0) anche alle altre fleet reali
    // Raccogli tutte le op usate
    const allOpNames = new Set<string>();
    for (const f of Object.values(feesByFleet)) {
      Object.keys(f.operations).forEach(op => allOpNames.add(op));
    }
    for (const fleetKey of fleetAccounts) {
      if (feesByFleet[fleetKey]) {
        for (const op of allOpNames) {
          if (!feesByFleet[fleetKey].operations[op]) {
            feesByFleet[fleetKey].operations[op] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
          }
        }
      }
    }
  } else {
    // fallback: single catch-all, come prima
    const operations: Record<string, any> = {};
    for (const tx of items) {
      const opName = tx.operation || ((Array.isArray(tx.programIds) && tx.programIds[0]) ? String(tx.programIds[0]) : 'Unknown');
      if (!operations[opName]) operations[opName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
      operations[opName].count++;
      operations[opName].totalFee += (tx.fee || 0);
      operations[opName].avgFee = operations[opName].totalFee / operations[opName].count;
      if (tx.signature) operations[opName].details.push(tx.signature);
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

  // Restituisci solo la struttura feesByFleet completa, senza filtri
  return {
    walletPubkey,
    feesByFleet,
    opts
  };
}

// Import needed for buildAccountToFleetMap
import { buildAccountToFleetMap } from './lib/fleet-association.js';
