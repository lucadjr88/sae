import { TransactionInfo } from './types.js';
import { getAccountTransactions } from './account-transactions.js';
import { newConnection } from '../utils/anchor-setup.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import OP_MAP from './op-map.js';
import * as fs from 'fs';
import * as path from 'path';

export async function getWalletSageFeesDetailed(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  fleetRentalStatus: { [account: string]: boolean } = {},
  hours: number = 24,
  opts?: { refresh?: boolean },
  poolConnection?: RpcPoolConnection  // Optional pre-configured pool connection
): Promise<{
  walletAddress: string;
  period: string;
  totalFees24h: number;
  sageFees24h: number;
  transactionCount24h: number;
  totalSignaturesFetched: number;
  feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; isRented?: boolean; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number; details?: string[] } }; fleetName?: string } };
  feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number; details?: string[] } };
  transactions: TransactionInfo[];
  unknownOperations: number;
  rentedFleetAccounts: string[];
  fleetAccountNamesEcho: { [account: string]: string };
  fleetRentalStatusFinal: { [account: string]: boolean };
}> {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const connection = newConnection(rpcEndpoint, rpcWebsocket);

  // Debug: Print all input parameters for troubleshooting
  console.log('--- DEBUG getWalletSageFeesDetailed ---');
  console.log('Fleet accounts:', fleetAccounts);
  console.log('Fleet names:', fleetAccountNames);
  console.log('Fleet rental status:', fleetRentalStatus);
  console.log('Hours:', hours);
  console.log('Wallet pubkey:', walletPubkey);
  console.log('--------------------------------------');

  // Exclude common/generic accounts that appear in all transactions
  const excludeAccounts = [
    'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE', // SAGE Program
    'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr', // Game Program  
    '11111111111111111111111111111111', // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  ];
  
  // Filter out generic accounts from fleet accounts
  const specificFleetAccounts = fleetAccounts.filter(account => 
    account && !excludeAccounts.includes(account) && account.length > 40
  );
  
  console.log(`[DEBUG] Specific fleet accounts (after filtering): ${specificFleetAccounts.length}`);
  specificFleetAccounts.forEach((fleet, i) => console.log(`  Specific Fleet ${i}: ${fleet.substring(0, 8)}...`));
  
  // Build map from account to fleet for sub-accounts (cargoHold, fuelTank, ammoBank)
  const accountToFleet: { [account: string]: string } = {};
  const cacheDir = path.join(process.cwd(), 'cache', 'fleets');
  for (const fleet of specificFleetAccounts) {
    const cacheFile = path.join(cacheDir, `${fleet}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const data = cacheData.data?.data;
        if (data) {
          if (data.cargoHold) accountToFleet[data.cargoHold] = fleet;
          if (data.fuelTank) accountToFleet[data.fuelTank] = fleet;
          if (data.ammoBank) accountToFleet[data.ammoBank] = fleet;
        }
      } catch (e) {
        console.warn(`Failed to read cache for fleet ${fleet}:`, e);
      }
    }
  }
  
  // Also include rented fleets in the accountToFleet map
  const rentedCacheDir = path.join(process.cwd(), 'cache', 'rented-fleets');
  if (fs.existsSync(rentedCacheDir)) {
    const rentedFiles = fs.readdirSync(rentedCacheDir).filter(file => file.endsWith('.json'));
    for (const file of rentedFiles) {
      const cacheFile = path.join(rentedCacheDir, file);
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const fleet = Object.keys(cacheData)[0];
        const data = cacheData[fleet]?.data;
        if (data) {
          if (data.cargoHold) accountToFleet[data.cargoHold] = fleet;
          if (data.fuelTank) accountToFleet[data.fuelTank] = fleet;
          if (data.ammoBank) accountToFleet[data.ammoBank] = fleet;
        }
      } catch (e) {
        console.warn(`Failed to read rented cache for ${file}:`, e);
      }
    }
  }
  
  console.log(`[DEBUG] Built accountToFleet map with ${Object.keys(accountToFleet).length} sub-accounts`);
  
  // Compute cutoff for the analysis window
  const now = Date.now();
  const cutoffTime = now - (hours * 60 * 60 * 1000);

  // Get all transactions for wallet (paginate until cutoff - process in chunks)
  const result = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    5000,  // Allow up to 5000 to cover 24h
    cutoffTime,
    10000,  // Max signatures for 24h coverage
    opts,
    poolConnection  // Pass the pool connection if provided
  );
  const allTransactions = result.transactions;
  const totalSigs = result.totalSignaturesFetched;
  
  const recent24h = allTransactions.filter(tx => {
    const txTime = new Date(tx.timestamp).getTime();
    return txTime >= cutoffTime && tx.programIds.includes(SAGE_PROGRAM_ID);
  });

  // Analyze by fleet and operation
  const feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; isRented?: boolean; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number; details?: string[] } }; fleetName?: string } } = {};
  const feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number; details?: string[] } } = {};
  let totalFees24h = 0;
  let sageFees24h = 0;
  let unknownOperations = 0;
  
  // Track which fleets have rental operations
  const rentedFleets = new Set<string>();
  // Helper functions for fallback association of rented fleets
  function findRentedFleetByHeuristics(tx: any, rentedFleets: Set<string>): string | null {
    if (!tx.accountKeys || !Array.isArray(tx.accountKeys)) return null;
    
    // Check for proximity: fleet key with unknown accounts within 2 positions
    for (const fleet of rentedFleets) {
      const fleetIndex = tx.accountKeys.indexOf(fleet);
      if (fleetIndex !== -1) {
        // Check if there are unknown accounts nearby
        const nearbyAccounts = tx.accountKeys.slice(Math.max(0, fleetIndex - 2), fleetIndex + 3);
        const hasUnknownAccount = nearbyAccounts.some((acc: string) => !specificFleetAccounts.includes(acc));
        if (hasUnknownAccount) {
          return fleet;
        }
      }
    }
    
    // Check for instruction-based patterns (cargo operations, etc.)
    const instructions = (tx.instructions || []).join(" ").toLowerCase();
    if (instructions.includes("cargo") || instructions.includes("deposit") || instructions.includes("withdraw")) {
      // For cargo operations, check if any rented fleet is in accountKeys
      for (const fleet of rentedFleets) {
        if (tx.accountKeys.includes(fleet)) {
          return fleet;
        }
      }
    }
    
    return null;
  }
  
  function assignTransactionToFleet(tx: any, fleetKey: string, feesByFleet: any) {
    if (!feesByFleet[fleetKey]) {
      feesByFleet[fleetKey] = {
        totalFee: 0,
        feePercentage: 0,
        totalOperations: 0,
        isRented: true, // Assume rented since this is fallback
        operations: {},
        fleetName: fleetKey.substring(0, 8)
      };
    }
    
    const fleetEntry = feesByFleet[fleetKey];
    fleetEntry.totalFee += tx.fee;
    fleetEntry.isRented = true;
    
    // Add to a generic "Fallback" operation
    if (!fleetEntry.operations["Fallback"]) {
      fleetEntry.operations["Fallback"] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
    }
    const op = fleetEntry.operations["Fallback"];
    op.count++;
    op.totalFee += tx.fee;
    op.avgFee = op.totalFee / op.count;
    op.details!.push(tx.signature);
    
    console.log(`[FALLBACK] Associated tx ${tx.signature?.substring(0, 8)} to rented fleet ${fleetKey.substring(0, 8)}`);
  }

  // Complete SAGE instruction mapping from official IDL (SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE)
  // Source: https://github.com/staratlasmeta/star-atlas-decoders
 

  for (const tx of recent24h) {
    totalFees24h += tx.fee;
    if (!tx.programIds.includes(SAGE_PROGRAM_ID)) continue;
    sageFees24h += tx.fee;
    
    // Don't skip transactions without parsed instructions - they may still have log messages
    // We'll try to decode from logs below

    // Determine operation using MULTIPLE sources with enhanced patterns
    let operation = 'Unknown';

    // Debug: Print transaction signature, accountKeys, and instructions for first 10 tx
    const isFirstFewTx = recent24h.indexOf(tx) < 10;
    if (isFirstFewTx) {
      console.log('--- TX DEBUG ---');
      console.log('Signature:', tx.signature);
      console.log('AccountKeys:', tx.accountKeys);
      console.log('Instructions:', tx.instructions);
      console.log('ProgramIds:', tx.programIds);
      console.log('LogMessages:', tx.logMessages);
      console.log('----------------');
    }

    // ...existing code for operation detection and fleet matching...
        // Legacy operation and fleet detection logic
        // Method 1: Check instruction names from transaction (most reliable)
        if (tx.instructions && tx.instructions.length > 0) {
          for (const instr of tx.instructions) {
            if (OP_MAP[instr]) {
              operation = OP_MAP[instr];
              break;
            }
            for (const [key, value] of Object.entries(OP_MAP) as [string, string][]) {
              if (instr.toLowerCase().includes(key.toLowerCase())) {
                operation = value;
                break;
              }
            }
            if (operation !== 'Unknown') break;
          }
        }
        // Method 2: Check log messages for instruction patterns
        if (operation === 'Unknown' && tx.logMessages) {
          for (const log of tx.logMessages) {
            const ixMatch = log.match(/Instruction:\s*(\w+)/i);
            if (ixMatch) {
              const ixName = ixMatch[1];
              if (OP_MAP[ixName]) {
                operation = OP_MAP[ixName];
                break;
              }
            }
            for (const [key, value] of Object.entries(OP_MAP) as [string, string][]) {
              if (log.includes(key)) {
                operation = value;
                break;
              }
            }
            if (operation !== 'Unknown') break;
          }
        }
        // Method 3: Pattern-based detection for common operations
        if (operation === 'Unknown') {
          const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
          const innerText = (tx.instructions || []).join(' ').toLowerCase();
          const combinedLower = (logsLower + ' ' + innerText).trim();
          if (combinedLower.includes('craft')) {
            operation = 'Crafting';
          } else if (combinedLower.includes('mine') || combinedLower.includes('mining')) {
              operation = 'Mining';
          } else if (combinedLower.includes('subwarp')) {
            if (combinedLower.includes('subwarp')) {
              operation = 'Subwarp';
            }
          } else if (combinedLower.includes('warp')) {
            // Warp normale, NON subwarp
            operation = 'Warp';
          } else if (combinedLower.includes('scan')) {
              operation = 'Scan';
          } else if (combinedLower.includes('dock') || combinedLower.includes('undock') ||
                     combinedLower.includes('load') || combinedLower.includes('unload')) {
            operation = 'Dock/Undock/Load/Unload';
          }
        }
        if (operation === 'Unknown') unknownOperations++;
        
        // Enhanced FleetStateHandler detection: check if it's actually a Subwarp completion
        if (operation === 'FleetStateHandler') {
          const logsJoined = (tx.logMessages || []).join(' ');
          if (logsJoined.includes('MoveSubwarp')) {
            operation = 'Subwarp';  // It's completing a subwarp movement
          } else if (logsJoined.includes('MineAsteroid')) {
            operation = 'Mining';  // It's completing mining
          }
          // Otherwise keep as FleetStateHandler for other state transitions
        }
        
        // MATCHING completo: usa key principale e sub-account (cargoHold, fuelTank, ammoBank)
        let involvedFleet: string | undefined = undefined;
        let involvedFleetName: string | undefined = undefined;
        let matchStrategy = 'none';
        if (tx.accountKeys && tx.accountKeys.length > 0) {
          // Prima controlla key principali
          for (const fleet of specificFleetAccounts) {
            if (tx.accountKeys.includes(fleet)) {
              involvedFleet = fleet;
              console.log(`[DEBUG] involvedFleet set to: ${fleet.substring(0, 8)}... for tx ${tx.signature?.substring(0, 8)}...`);
              involvedFleetName = (fleetAccountNames && fleetAccountNames[fleet]) ? fleetAccountNames[fleet] : fleet.substring(0, 8);
              matchStrategy = 'direct';
              break;
            }
          }
          // Poi controlla sub-account
          if (!involvedFleet) {
            for (const account of tx.accountKeys) {
              if (accountToFleet[account]) {
                involvedFleet = accountToFleet[account];
                involvedFleetName = (fleetAccountNames && fleetAccountNames[involvedFleet]) ? fleetAccountNames[involvedFleet] : involvedFleet.substring(0, 8);
                matchStrategy = 'subaccount';
                break;
              }
            }
          }
        }
        // Fallback for Subwarp: if not found and operation is Subwarp, search in fleetAccountNames
        if (!involvedFleet && operation.includes('Subwarp')) {
          if (tx.accountKeys) {
            for (const acc of tx.accountKeys) {
              if (fleetAccountNames && fleetAccountNames[acc]) {
                involvedFleet = acc;
                involvedFleetName = fleetAccountNames[acc];
                matchStrategy = 'subwarp_fallback';
                break;
              }
            }
          }
        }
        
        // Debug logging for dock/undock operations
        if (operation === 'Dock' || operation === 'Undock') {
          console.log(`[DOCK OPERATION] ${tx.signature.substring(0, 8)}... operation=${operation}, involvedFleet=${involvedFleet || 'none'}, matchStrategy=${matchStrategy}, accountKeys=${tx.accountKeys?.slice(0, 5).join(',')}...`);
        }
        
        // Se nessuna flotta trovata, fallback su categoria
        if (!involvedFleet) {
          if (operation.includes('Craft') || operation.includes('craft')) {
            involvedFleetName = 'Crafting Operations';
            matchStrategy = 'category_craft';
          } else if (operation.includes('Starbase') || operation.includes('starbase')) {
            involvedFleetName = 'Starbase Operations';
            matchStrategy = 'category_starbase';
          } else if (operation.includes('Register') || operation.includes('Deregister') || operation.includes('Update')) {
            involvedFleetName = 'Configuration';
            matchStrategy = 'category_config';
          } else if (operation.includes('Crew') || operation.includes('crew')) {
            involvedFleetName = 'Crew Management';
            matchStrategy = 'category_crew';
          } else if (operation.includes('SDU') || operation.includes('Survey')) {
            involvedFleetName = 'Survey & Discovery';
            matchStrategy = 'category_survey';
          } else if (operation.includes('Profile') || operation.includes('Progression') || operation.includes('Points')) {
            involvedFleetName = 'Player Profile';
            matchStrategy = 'category_profile';
          } else if (operation.includes('Rental') || operation.includes('rental')) {
            involvedFleetName = 'Fleet Rentals';
            matchStrategy = 'category_rental';
          } else if (operation.includes('Sector') || operation.includes('Planet') || operation.includes('Star')) {
            involvedFleetName = 'Universe Management';
            matchStrategy = 'category_universe';
          } else if (operation.includes('Game') || operation.includes('game')) {
            involvedFleetName = 'Game Management';
            matchStrategy = 'category_game';
          } else {
            involvedFleetName = 'Other Operations';
            matchStrategy = 'category_other';
          }
        }

        // Raggruppa solo se è effettivamente Subwarp
        let groupedOperation = operation;
        const logsLowerForGroup = (tx.logMessages || []).join(' ').toLowerCase();
        if (
          (operation === 'StartSubwarp' || operation === 'StopSubwarp' || operation === 'EndSubwarp' || operation === 'Subwarp') &&
          logsLowerForGroup.includes('subwarp')
        ) {
          groupedOperation = 'Subwarp';
        } else if (operation === 'Warp') {
          groupedOperation = 'Warp';
        } else if (operation === 'StartMining' || operation === 'StopMining') {
          groupedOperation = 'Mining';
        } else if (operation === 'StartScan' || operation === 'StopScan' || operation === 'ScanSDU') {
          groupedOperation = 'Scan';
        } else if (operation === 'Dock' || operation === 'Undock' || operation === 'LoadCargo' || operation === 'UnloadCargo') {
          groupedOperation = 'Dock/Undock/Load/Unload';
        } else if (operation === 'CraftStart' || operation === 'CraftClaim' || operation === 'Crafting') {
          groupedOperation = 'Crafting';
        } else if (operation === 'DepositTokens' || operation === 'WithdrawTokens') {
          groupedOperation = 'Token Ops';
        } else if (operation === 'CreateCargoPod' || operation === 'CloseCargoPod' || operation === 'DepositToPod' || operation === 'WithdrawFromPod') {
          groupedOperation = 'Cargo Pods';
        }
    
    // If crafting detected but material missing, infer Fuel/Food from logs/instructions
    let craftingMaterial: string | undefined = undefined;
    let craftingDetail: string = '';
    if (operation === 'Crafting' || groupedOperation === 'Crafting') {
      const logsLower2 = (tx.logMessages || []).join(' ').toLowerCase();
      const instrLower2 = (tx.instructions || []).join(' ').toLowerCase();
      const combinedLower2 = `${logsLower2} ${instrLower2}`;
      if (combinedLower2.includes('fuel') || combinedLower2.includes('hydrogen')) {
        craftingMaterial = 'Fuel';
      } else if (combinedLower2.includes('food') || combinedLower2.includes('biomass')) {
        craftingMaterial = 'Food';
      }
      tx.fleetAssigned = true;
      // Estrai i materiali bruciati dal log
      const burnMatch = combinedLower2.match(/burn[:\s]+([a-z\s0-9]+?)(?:\s|;|$)/);
      if (burnMatch) {
        craftingDetail = `Burn ${burnMatch[1].trim()}`;
      } else {
        craftingDetail = `Crafting ${craftingMaterial || 'Unknown'}`;
      }
    }
    
    // Per Crafting, split in Craft Fuel vs Craft Food based on craftingMaterial
    // If we can't determine type, default to "Craft Food" to avoid generic "Crafting" category
    let finalOperationForStats = groupedOperation;
    if (groupedOperation === 'Crafting') {
      finalOperationForStats = (craftingMaterial === 'Fuel') ? 'Craft Fuel' : 'Craft Food';
    }
    
    // Update global operation stats with final (split) operation names
    if (!feesByOperation[finalOperationForStats]) {
      feesByOperation[finalOperationForStats] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    }
    const opEntry = feesByOperation[finalOperationForStats];
    // Only count and add details for true Subwarp (logs/instructions must confirm)
    if (finalOperationForStats === 'Subwarp') {
      const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
      const instrLower = (tx.instructions || []).join(' ').toLowerCase();
      if (logsLower.includes('subwarp') || instrLower.includes('subwarp')) {
        opEntry.count++;
        opEntry.totalFee += tx.fee;
        opEntry.avgFee = opEntry.totalFee / opEntry.count;
        opEntry.details!.push(tx.signature);
      }
    } else {
      opEntry.count++;
      opEntry.totalFee += tx.fee;
      opEntry.avgFee = opEntry.totalFee / opEntry.count;
      if (craftingDetail) {
        opEntry.details!.push(craftingDetail);
      }
    }
    
    // Track rental operations - mark fleets with rental ops as rented
    if (operation.includes('Rental') || operation.toLowerCase().includes('rental') || 
        operation === 'AddRental' || operation === 'ChangeRental') {
      if (involvedFleet) {
        rentedFleets.add(involvedFleet);
      }
      // Also check all accounts in the transaction for fleet matches
      if (tx.accountKeys) {
        for (const fleet of specificFleetAccounts) {
          if (tx.accountKeys.includes(fleet)) {
            rentedFleets.add(fleet);
            console.log(`[RENTAL] Marked fleet as rented: ${fleet.substring(0, 8)}... (operation: ${operation})`);
          }
        }
      }
    }

    // Usa la pubkey della flotta come chiave principale (compatibilità legacy)
    // Usa sempre la chiave pubblica della flotta come chiave 1:1
    if (involvedFleet) {
      const fleetKey = involvedFleet;
      if (!feesByFleet[fleetKey]) {
        feesByFleet[fleetKey] = {
          totalFee: 0,
          feePercentage: 0,
          totalOperations: 0,
          isRented: false,
          operations: {},
          fleetName: (fleetAccountNames && fleetAccountNames[fleetKey]) ? fleetAccountNames[fleetKey] : fleetKey.substring(0, 8)
        };
      }
      const fleetEntry = feesByFleet[fleetKey];
      fleetEntry.totalFee += tx.fee;
      let txRented = false;
      if (fleetRentalStatus[fleetKey]) txRented = true;
      if (rentedFleets.has(fleetKey)) txRented = true;
      fleetEntry.isRented = !!(fleetEntry.isRented || txRented);
      // Use the same finalOperation that we determined for stats
      let finalOperation = finalOperationForStats;
      let operationDetail = craftingDetail;
      if (finalOperation === 'Subwarp') {
        const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
        const instrLower = (tx.instructions || []).join(' ').toLowerCase();
        if (logsLower.includes('subwarp') || instrLower.includes('subwarp')) {
          if (!fleetEntry.operations[finalOperation]) {
            fleetEntry.operations[finalOperation] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
          }
          const fleetOp = fleetEntry.operations[finalOperation];
          fleetOp.count++;
          fleetOp.totalFee += tx.fee;
          fleetOp.avgFee = fleetOp.totalFee / fleetOp.count;
          fleetOp.details!.push(tx.signature);
        }
      } else {
        if (!fleetEntry.operations[finalOperation]) {
          fleetEntry.operations[finalOperation] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
        }
        const fleetOp = fleetEntry.operations[finalOperation];
        fleetOp.count++;
        fleetOp.totalFee += tx.fee;
        fleetOp.avgFee = fleetOp.totalFee / fleetOp.count;
        if (operationDetail) {
          fleetOp.details!.push(operationDetail);
        }
      }
    }
  }

  
  // Fallback association for rented fleets with incomplete data
  // This runs after standard association to catch transactions that involve sub-accounts
  if (true) { // Enable fallback association for rented fleets
    console.log(`[FALLBACK] Starting fallback association for ${allTransactions.length} transactions`);
    for (const tx of allTransactions) {
      if (!tx.fleetAssigned) {
        const rentedFleet = findRentedFleetByHeuristics(tx, rentedFleets);
        if (rentedFleet) {
          assignTransactionToFleet(tx, rentedFleet, feesByFleet);
          tx.fleetAssigned = true;
        }
      }
    }
    console.log(`[FALLBACK] Completed fallback association`);
  }
  // Compute percentages per fleet & per operation
  Object.values(feesByFleet).forEach(fleetEntry => {
    fleetEntry.feePercentage = fleetEntry.totalFee / (sageFees24h || 1);
    // Se la flotta ha Subwarp ma details è vuoto, elimina la voce
    if (
      fleetEntry.operations['Subwarp'] &&
      Array.isArray(fleetEntry.operations['Subwarp'].details) &&
      fleetEntry.operations['Subwarp'].details.length === 0
    ) {
      delete fleetEntry.operations['Subwarp'];
    }
    // Calculate total operations for this fleet
    fleetEntry.totalOperations = Object.values(fleetEntry.operations).reduce((sum: number, op: any) => sum + op.count, 0);
    Object.values(fleetEntry.operations).forEach(op => {
      op.percentageOfFleet = op.totalFee / (fleetEntry.totalFee || 1);
    });
  });

  Object.values(feesByOperation).forEach(op => {
    op.avgFee = op.totalFee / (op.count || 1);
  });

  console.log('\n📈 Enhanced Analysis Results:');
  console.log(`Total SAGE transactions processed: ${recent24h.length}`);
  console.log(`Total fees: ${totalFees24h / 1000000000} SOL`);
  console.log(`SAGE fees: ${sageFees24h / 1000000000} SOL`);
  console.log(`Unknown operations: ${unknownOperations} (${(unknownOperations/recent24h.length*100).toFixed(1)}%)`);
  console.log('\n🔍 Operations breakdown:');
  Object.entries(feesByOperation).forEach(([op, data]) => {
    console.log(`  ${op}: ${data.count} transactions, ${(data.totalFee / 1000000000).toFixed(6)} SOL`);
  });
  console.log('\nFleet operations:');
  Object.entries(feesByFleet).forEach(([fleet, data]) => {
    const totalOps = Object.values(data.operations).reduce((sum: number, op: any) => sum + op.count, 0);
    console.log(`  ${fleet}: ${totalOps} total operations, ${(data.totalFee / 1000000000).toFixed(6)} SOL`);
  });

  // Build final rental status, combining input map with detected rental ops
  const fleetRentalStatusFinal: { [account: string]: boolean } = { ...(fleetRentalStatus || {}) };
  for (const acc of rentedFleets) {
    fleetRentalStatusFinal[acc] = true;
  }
  const rentedFleetAccounts = Object.entries(fleetRentalStatusFinal)
    .filter(([_, v]) => !!v)
    .map(([k]) => k);

  return {
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h,
    sageFees24h,
    transactionCount24h: recent24h.length,
    totalSignaturesFetched: totalSigs,
    feesByFleet,
    feesByOperation,
    transactions: recent24h,
    unknownOperations,
    rentedFleetAccounts,
    fleetAccountNamesEcho: fleetAccountNames || {},
    fleetRentalStatusFinal
  };
// (Parentesi graffa finale rimossa)
}
