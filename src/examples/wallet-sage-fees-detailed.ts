
import { TransactionInfo } from './types.js';
import { getAccountTransactions } from './account-transactions.js';
import { newConnection } from '../utils/anchor-setup.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { SAGE_INSTRUCTION_MAP } from '../decoders/sage-instruction-map.js';

const SAGE_SPECIFIC_INSTRUCTIONS = new Set(SAGE_INSTRUCTION_MAP.map(i => i.name));
// Rimuovi FleetStateHandler dai prioritari per forzare il check degli altri o la raffinazione
SAGE_SPECIFIC_INSTRUCTIONS.delete('FleetStateHandler');

// Funzione ripristinata da sae-main_funzionante il 2025-12-30
export async function getWalletSageFeesDetailed(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  fleetRentalStatus: { [account: string]: boolean } = {},
  hours: number = 24,
  opts?: { refresh?: boolean },
  poolConnection?: RpcPoolConnection
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
  
  // console.log(`[DEBUG] Specific fleet accounts (after filtering): ${specificFleetAccounts.length}`);
  // specificFleetAccounts.forEach((fleet, i) => console.log(`  Specific Fleet ${i}: ${fleet.substring(0, 8)}...`));
  
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
    let foundMethod = 'none';

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

    // Use raw instruction names directly from transaction
    if (tx.compositeDecoded && tx.compositeDecoded.isComposite) {
      const decodedNames = tx.compositeDecoded.instructions
        .filter((ix: any) => ix.success && ix.instructionName)
        .map((ix: any) => ix.instructionName);
      
      if (decodedNames.length > 0) {
        operation = decodedNames[0];
        foundMethod = 'composite_rust_decoder';
      }
    }

    if (operation === 'Unknown' && tx.instructions && tx.instructions.length > 0) {
      // Cerca prima istruzioni SAGE specifiche (es. StopMiningAsteroid)
      const specificIx = tx.instructions.find(ix => SAGE_SPECIFIC_INSTRUCTIONS.has(ix));
      if (specificIx) {
        operation = specificIx;
        foundMethod = 'instruction_sage_specific';
      } else {
        // Fallback alla prima istruzione non-generic se possibile
        for (const instr of tx.instructions) {
          if (instr && instr.trim() && !['ComputeBudget', 'Approve', 'Burn', 'Transfer', 'IncrementPoints'].includes(instr)) {
            operation = instr;
            foundMethod = 'instruction_raw_filtered';
            break;
          }
        }
        // Se ancora Unknown, prendi la prima in assoluto
        if (operation === 'Unknown') {
          operation = tx.instructions[0];
          foundMethod = 'instruction_raw_first';
        }
      }
    }
    // Fallback: extract from log messages
    if (operation === 'Unknown' && tx.logMessages) {
      for (const log of tx.logMessages) {
        const ixMatch = log.match(/Instruction:\s*(\w+)/i);
        if (ixMatch) {
          const ixName = ixMatch[1];
          if (SAGE_SPECIFIC_INSTRUCTIONS.has(ixName)) {
            operation = ixName;
            foundMethod = 'log_instruction_sage_specific';
            break;
          }
          if (operation === 'Unknown') {
            operation = ixName;
            foundMethod = 'log_instruction_raw';
          }
        }
      }
    }

    // Raffinamento FleetStateHandler: se l'operazione è FleetStateHandler, guarda i log per capire cosa sta succedendo
    if (operation === 'FleetStateHandler' && tx.logMessages) {
      const logsJoined = tx.logMessages.join(' ');
      const logsLower = logsJoined.toLowerCase();
      if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) {
        operation = 'FleetStateHandler_subwarp';
        foundMethod = 'fleet_state_refinement_subwarp';
      } else if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) {
        operation = 'FleetStateHandler_mining';
        foundMethod = 'fleet_state_refinement_mining';
      } else if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) {
        operation = 'FleetStateHandler_loading_bay';
        foundMethod = 'fleet_state_refinement_loading_bay';
      }
    }

    if (operation === 'Unknown') unknownOperations++;
    
    // MATCHING semplificato: usa solo la key principale della flotta
    let involvedFleet: string | undefined = undefined;
    let involvedFleetName: string | undefined = undefined;
    let matchStrategy = 'none';
    if (tx.accountKeys && tx.accountKeys.length > 0) {
      for (const fleet of specificFleetAccounts) {
        if (tx.accountKeys.includes(fleet)) {
          involvedFleet = fleet;
          involvedFleetName = (fleetAccountNames && fleetAccountNames[fleet]) ? fleetAccountNames[fleet] : fleet.substring(0, 8);
          matchStrategy = 'direct';
          break;
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

    // No grouping - use raw operation names
    let finalOperationForStats = operation;
    let craftingDetail: string = '';
    
    // Update global operation stats with raw operation names
    if (!feesByOperation[finalOperationForStats]) {
      feesByOperation[finalOperationForStats] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    }
    const opEntry = feesByOperation[finalOperationForStats];
    opEntry.count++;
    opEntry.totalFee += tx.fee;
    opEntry.avgFee = opEntry.totalFee / opEntry.count;
    if (craftingDetail) {
      opEntry.details!.push(craftingDetail);
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
      
      // Aggregate ALL instructions found in the transaction
      const instructionsToAggregate = tx.instructions && tx.instructions.length > 0 
        ? tx.instructions 
        : [operation];

      for (const finalOperation of instructionsToAggregate) {
        if (!fleetEntry.operations[finalOperation]) {
          fleetEntry.operations[finalOperation] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
        }
        const fleetOp = fleetEntry.operations[finalOperation];
        fleetOp.count++;
        // We attribute the full fee to each instruction in the composite (simplified)
        // or we could divide it, but usually users want to see the count of each op
        fleetOp.totalFee += tx.fee;
        fleetOp.avgFee = fleetOp.totalFee / fleetOp.count;
        if (craftingDetail) {
          fleetOp.details!.push(craftingDetail);
        }
      }
    }
  }

  // Compute percentages per fleet & per operation
  Object.values(feesByFleet).forEach(fleetEntry => {
    fleetEntry.feePercentage = fleetEntry.totalFee / (sageFees24h || 1);
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
}
