import { Connection, PublicKey, ConfirmedSignatureInfo, ParsedTransactionWithMeta } from "@solana/web3.js";
import { newConnection } from '../utils/anchor-setup.js';

export interface TransactionInfo {
  signature: string;
  blockTime: number;
  slot: number;
  err: any;
  memo?: string;
  timestamp: string;
  status: 'success' | 'failed';
  fee: number;
  programIds: string[];
  instructions?: string[];            // Parsed instruction names from logs
  logMessages?: string[];             // Raw log messages for deeper parsing
  accountKeys?: string[];             // All account pubkeys involved in the tx
}

export interface FleetOperation {
  fleetAccount: string;
  operation: string;
  count: number;
  totalFee: number;
  transactions: TransactionInfo[];
}

export async function getAccountTransactions(
  rpcEndpoint: string, 
  rpcWebsocket: string, 
  accountPubkey: string,
  limit: number = 50
): Promise<TransactionInfo[]> {
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const pubkey = new PublicKey(accountPubkey);

  // Get signatures for address
  const signatures = await connection.getSignaturesForAddress(pubkey, { limit });

  // Get transaction details
  const transactions: TransactionInfo[] = [];
  
  for (const sig of signatures) {
    const tx = await connection.getParsedTransaction(sig.signature, { 
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    if (!tx) continue;

    const programIds = tx.transaction.message.instructions
      .map((ix: any) => ix.programId?.toString())
      .filter((id: any) => id);

    const instructions: string[] = [];
    const logMessages: string[] = tx.meta?.logMessages || [];

    // Enhanced log parsing to extract ALL instructions
    logMessages.forEach(log => {
      // Match "Program SAGE2HAw... invoke [N]" and "Instruction: InstructionName"
      const invokeMatch = log.match(/Program ([A-Za-z0-9]{32,44}) invoke \[(\d+)\]/);
      const ixMatch = log.match(/Instruction: (\w+)/);
      
      if (ixMatch) {
        instructions.push(ixMatch[1]);
      }
      
      // Also capture any SAGE-specific instruction patterns from logs
      if (log.includes('SAGE') || log.includes('sage')) {
        // Extract instruction data from SAGE logs
        const sageIxMatch = log.match(/ix([A-Z][a-zA-Z]+)/);
        if (sageIxMatch) {
          instructions.push(sageIxMatch[1]);
        }
      }
    });

    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());

    transactions.push({
      signature: sig.signature,
      blockTime: sig.blockTime || 0,
      slot: sig.slot,
      err: sig.err,
      memo: sig.memo || undefined,
      timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'Unknown',
      status: sig.err ? 'failed' : 'success',
      fee: tx.meta?.fee || 0,
      programIds: [...new Set(programIds)],
      instructions: [...new Set(instructions)],
      logMessages,
      accountKeys
    });
  }

  return transactions;
}

export async function getFleetTransactions(
  rpcEndpoint: string,
  rpcWebsocket: string,
  fleetAccountPubkey: string,
  limit: number = 50
): Promise<{
  fleetAccount: string;
  totalTransactions: number;
  transactions: TransactionInfo[];
}> {
  const transactions = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    fleetAccountPubkey,
    limit
  );

  return {
    fleetAccount: fleetAccountPubkey,
    totalTransactions: transactions.length,
    transactions
  };
}

export async function getWalletSageTransactions(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  limit: number = 100
): Promise<{
  walletAddress: string;
  totalTransactions: number;
  sageTransactions: number;
  totalFees: number;
  totalSageFees: number;
  transactions: TransactionInfo[];
  feesByProgram: { [program: string]: { count: number; totalFee: number } };
}> {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  
  const allTransactions = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    limit
  );

  // Filter SAGE transactions
  const sageTransactions = allTransactions.filter(tx => 
    tx.programIds.includes(SAGE_PROGRAM_ID)
  );

  // Calculate fees by program
  const feesByProgram: { [program: string]: { count: number; totalFee: number } } = {};
  let totalFees = 0;
  let totalSageFees = 0;

  allTransactions.forEach(tx => {
    totalFees += tx.fee;
    
    if (tx.programIds.includes(SAGE_PROGRAM_ID)) {
      totalSageFees += tx.fee;
    }

    tx.programIds.forEach(programId => {
      if (!feesByProgram[programId]) {
        feesByProgram[programId] = { count: 0, totalFee: 0 };
      }
      feesByProgram[programId].count++;
      feesByProgram[programId].totalFee += tx.fee / tx.programIds.length; // Divide fee among programs
    });
  });

  return {
    walletAddress: walletPubkey,
    totalTransactions: allTransactions.length,
    sageTransactions: sageTransactions.length,
    totalFees,
    totalSageFees,
    transactions: sageTransactions,
    feesByProgram
  };
}

export async function getWalletSageFeesDetailed(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  hours: number = 24
): Promise<{
  walletAddress: string;
  period: string;
  totalFees24h: number;
  sageFees24h: number;
  transactionCount24h: number;
  feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number } } } };
  feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number } };
  transactions: TransactionInfo[];
  unknownOperations: number;
}> {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  
  console.log(`[DEBUG] Fleet accounts received: ${fleetAccounts.length}`);
  fleetAccounts.forEach((fleet, i) => console.log(`  Fleet ${i}: ${fleet}`));
  
  console.log(`[DEBUG] Fleet names mapping received:`, Object.keys(fleetAccountNames || {}).length, 'entries');
  
  // Exclude common/generic accounts that appear in all transactions
  const excludeAccounts = [
    'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE', // SAGE Program
    'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr', // Game Program  
    'AAozfxCznAp5WNMFYd5medXuTh3MKM3u3LXBufhc1nhi', // Player Profile
    '11111111111111111111111111111111', // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  ];
  
  // Filter out generic accounts from fleet accounts
  const specificFleetAccounts = fleetAccounts.filter(account => 
    account && !excludeAccounts.includes(account) && account.length > 40
  );
  
  console.log(`[DEBUG] Specific fleet accounts (after filtering): ${specificFleetAccounts.length}`);
  specificFleetAccounts.forEach((fleet, i) => console.log(`  Specific Fleet ${i}: ${fleet.substring(0, 8)}...`));
  
  // Get all transactions for wallet (last 1000 to ensure we get 24h)
  const allTransactions = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    1000
  );

  // Filter transactions from last 24h
  const now = Date.now();
  const cutoffTime = now - (hours * 60 * 60 * 1000);
  
  const recent24h = allTransactions.filter(tx => {
    const txTime = new Date(tx.timestamp).getTime();
    return txTime >= cutoffTime && tx.programIds.includes(SAGE_PROGRAM_ID);
  });

  // Analyze by fleet and operation
  const feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number } } } } = {};
  const feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number } } = {};
  let totalFees24h = 0;
  let sageFees24h = 0;
  let unknownOperations = 0;

  // Enhanced Operation pattern mapping with official SAGE IDL instruction names
  const OP_MAP: { [key: string]: string } = {
    // Official SAGE instruction names from IDL
    'createFleet': 'CreateFleet',
    'fleetStateHandler': 'FleetState',
    'idleToLoadingBay': 'Dock',
    'loadingBayToIdle': 'Undock',
    'startMiningAsteroid': 'StartMining',
    'stopMiningAsteroid': 'StopMining',
    'startSubwarp': 'StartSubwarp',
    'stopSubwarp': 'StopSubwarp',
    'scanForSurveyDataUnits': 'ScanSDU',
    'depositCargoToFleet': 'LoadCargo',
    'withdrawCargoFromFleet': 'UnloadCargo',
    'warpToCoordinate': 'Warp',
    'warpLane': 'WarpLane',
    'respawnToLoadingBay': 'Respawn',
    'idleToRespawn': 'ToRespawn',
    'mineAsteroidToRespawn': 'Mining->Respawn',
    'subwarpToRespawn': 'Subwarp->Respawn',
    
    // Cargo and trading operations
    'transferCargoWithinFleet': 'TransferCargo',
    'depositCargoToGame': 'DepositCargo',
    'withdrawCargoFromGame': 'WithdrawCargo',
    
    // Legacy/alternative patterns for backwards compatibility
    'ixFleetStateHandler': 'FleetState',
    'FleetStateHandler': 'FleetState',
    'IdleToLoadingBay': 'Dock',
    'LoadingBayToIdle': 'Undock',
    'StartMiningAsteroid': 'StartMining',
    'StopMiningAsteroid': 'StopMining',
    'StartSubwarp': 'StartSubwarp',
    'DepositCargoToFleet': 'LoadCargo',
    'WithdrawCargoFromFleet': 'UnloadCargo',
    'WarpToCoordinate': 'Warp'
  };

  for (const tx of recent24h) {
    totalFees24h += tx.fee;
    if (!tx.programIds.includes(SAGE_PROGRAM_ID)) continue;
    sageFees24h += tx.fee;

    // Determine operation using MULTIPLE sources with enhanced patterns
    let operation = 'Unknown';
    let foundMethod = 'none';
    
    // Method 1: Check instruction names from transaction
    if (tx.instructions && tx.instructions.length > 0) {
      for (const instr of tx.instructions) {
        for (const [key, value] of Object.entries(OP_MAP)) {
          if (instr.toLowerCase().includes(key.toLowerCase())) {
            operation = value;
            foundMethod = 'instruction';
            break;
          }
        }
        if (operation !== 'Unknown') break;
      }
    }
    
    // Method 2: Check log messages with broader pattern matching
    if (operation === 'Unknown' && tx.logMessages) {
      for (const log of tx.logMessages) {
        // Direct keyword matching
        for (const [key, value] of Object.entries(OP_MAP)) {
          if (log.includes(key)) {
            operation = value;
            foundMethod = 'log_direct';
            break;
          }
        }
        
        // Enhanced pattern matching for SAGE-specific operations
        if (operation === 'Unknown') {
          if (log.includes('mine') || log.includes('Mining')) {
            if (log.includes('start') || log.includes('begin') || log.includes('Start')) {
              operation = 'StartMining';
              foundMethod = 'log_pattern';
            } else if (log.includes('stop') || log.includes('end') || log.includes('Stop')) {
              operation = 'StopMining';
              foundMethod = 'log_pattern';
            }
          } else if (log.includes('scan') || log.includes('Scan')) {
            if (log.includes('start') || log.includes('begin') || log.includes('Start')) {
              operation = 'StartScan';
              foundMethod = 'log_pattern';
            } else if (log.includes('stop') || log.includes('end') || log.includes('Stop')) {
              operation = 'StopScan';
              foundMethod = 'log_pattern';
            }
          } else if (log.includes('subwarp') || log.includes('Subwarp') || log.includes('warp')) {
            if (log.includes('start') || log.includes('begin') || log.includes('Start') || log.includes('enter')) {
              operation = 'StartSubwarp';
              foundMethod = 'log_pattern';
            } else if (log.includes('exit') || log.includes('complete') || log.includes('end') || log.includes('Exit')) {
              operation = 'EndSubwarp';
              foundMethod = 'log_pattern';
            }
          } else if (log.includes('dock') || log.includes('Dock')) {
            operation = log.includes('undock') || log.includes('Undock') ? 'Undock' : 'Dock';
            foundMethod = 'log_pattern';
          } else if (log.includes('fuel') || log.includes('Fuel')) {
            operation = 'Refuel';
            foundMethod = 'log_pattern';
          } else if (log.includes('ammo') || log.includes('Ammo')) {
            operation = 'Rearm';
            foundMethod = 'log_pattern';
          } else if (log.includes('cargo') || log.includes('Cargo')) {
            operation = log.includes('unload') || log.includes('Unload') ? 'UnloadCargo' : 'LoadCargo';
            foundMethod = 'log_pattern';
          } else if (log.includes('move') || log.includes('Move') || log.includes('movement')) {
            operation = 'Move';
            foundMethod = 'log_pattern';
          }
        }
        
        if (operation !== 'Unknown') break;
      }
    }
    
    // Method 3: Enhanced instruction data analysis for SAGE operations
    if (operation === 'Unknown' && tx.instructions) {
      for (const instr of tx.instructions) {
        // Look for SAGE program-specific patterns in instruction names
        const instrLower = instr.toLowerCase();
        
        if (instrLower.includes('ix')) {
          // SAGE instructions often start with 'ix'
          if (instrLower.includes('mining')) {
            operation = instrLower.includes('start') ? 'StartMining' : 'StopMining';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('scan')) {
            operation = instrLower.includes('start') || instrLower.includes('scan') ? 'StartScan' : 'StopScan';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('subwarp')) {
            operation = instrLower.includes('start') ? 'StartSubwarp' : 'EndSubwarp';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('dock')) {
            operation = instrLower.includes('undock') ? 'Undock' : 'Dock';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('cargo')) {
            operation = instrLower.includes('deposit') || instrLower.includes('load') ? 'LoadCargo' : 'UnloadCargo';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('fuel')) {
            operation = 'Refuel';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('ammo') || instrLower.includes('rearm')) {
            operation = 'Rearm';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('fleet')) {
            operation = instrLower.includes('initialize') ? 'CreateFleet' : 'FleetStateChange';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('warp')) {
            operation = 'Warp';
            foundMethod = 'instruction_sage';
            break;
          } else if (instrLower.includes('movement')) {
            operation = 'Move';
            foundMethod = 'instruction_sage';
            break;
          }
        }
      }
    }
    
    // Method 4: Analyze transaction structure for SAGE-specific patterns
    if (operation === 'Unknown' && tx.accountKeys) {
      const accountCount = tx.accountKeys.length;
      
      // Some SAGE operations have characteristic account count patterns
      // Based on observed patterns from real SAGE transactions
      if (accountCount === 8) {
        operation = 'StartSubwarp'; // Most subwarp operations have 8 accounts
        foundMethod = 'account_pattern';
      } else if (accountCount === 14) {
        operation = 'StartMining'; // Mining operations often have 14 accounts
        foundMethod = 'account_pattern';
      } else if (accountCount === 31) {
        operation = 'StartScan'; // Scanning operations often have 31 accounts
        foundMethod = 'account_pattern';
      } else if (accountCount === 41) {
        operation = 'StopMining'; // Stop mining often has 41 accounts
        foundMethod = 'account_pattern';
      } else if (accountCount >= 19 && accountCount <= 23) {
        operation = 'FleetStateChange'; // Generic fleet state changes
        foundMethod = 'account_pattern';
      } else if (accountCount >= 29 && accountCount <= 34) {
        operation = 'ComplexOperation'; // Complex operations with many accounts
        foundMethod = 'account_pattern';
      } else if (accountCount >= 10 && accountCount <= 12) {
        operation = 'SimpleOperation'; // Simple operations
        foundMethod = 'account_pattern';
      }
    }
    
    if (operation === 'Unknown') unknownOperations++;

    // ENHANCED: Find which fleet is involved using multiple strategies
    let involvedFleet: string | undefined = undefined;
    let involvedFleetName: string | undefined = undefined;
    let matchStrategy = 'none';
    
    if (tx.accountKeys && tx.accountKeys.length > 0) {
      // Strategy 1: Direct fleet account match
      for (const fleet of specificFleetAccounts) {
        if (tx.accountKeys.includes(fleet)) {
          involvedFleet = fleet;
          involvedFleetName = (fleetAccountNames && fleetAccountNames[fleet]) ? fleetAccountNames[fleet] : fleet.substring(0, 8);
          matchStrategy = 'direct';
          break;
        }
      }
    }
    
    // Group related operations (start/stop pairs and logistics)
    let groupedOperation = operation;
    
    // Debug: show original operation for first few transactions
    if (recent24h.indexOf(tx) < 5) {
      console.log(`  DEBUG: Original operation='${operation}', will group to='${groupedOperation}'`);
    }
    
    if (operation === 'StartSubwarp' || operation === 'StopSubwarp' || operation === 'EndSubwarp') {
      groupedOperation = 'Subwarp';
    } else if (operation === 'StartMining' || operation === 'StopMining') {
      groupedOperation = 'Mining';
    } else if (operation === 'StartScan' || operation === 'StopScan') {
      groupedOperation = 'Scan';
    } else if (operation === 'Dock' || operation === 'Undock' || operation === 'LoadCargo' || operation === 'UnloadCargo') {
      groupedOperation = 'Cargo/Dock';
    }
    
    // Enhanced debug logging to understand account patterns
    const isFirstFewTx = recent24h.indexOf(tx) < 10;
    
    if (isFirstFewTx || involvedFleet) {
      console.log(`TX ${tx.signature.substring(0, 8)}: operation=${groupedOperation} (${foundMethod}), accounts=${tx.accountKeys?.length || 0}, fleet=${involvedFleetName || 'NONE'}, strategy=${matchStrategy}`);
      
      if (isFirstFewTx && tx.accountKeys) {
        console.log('  Full account list:', tx.accountKeys.map(a => a.substring(0, 8) + '...'));
        console.log('  Checking against specific fleets:', specificFleetAccounts.map(f => f.substring(0, 8) + '...'));
        console.log('  Log messages sample:', (tx.logMessages || []).slice(0, 3));
        if (tx.instructions) {
          console.log('  Instructions:', tx.instructions.slice(0, 2));
        }
      }
      
      // Special logging for unknown operations to help debugging
      if (operation === 'Unknown' && isFirstFewTx) {
        console.log('  🔍 Unknown operation details:');
        console.log('    Account count:', tx.accountKeys?.length);
        console.log('    Log messages:', tx.logMessages?.slice(0, 5));
        console.log('    Instructions:', tx.instructions?.slice(0, 3));
      }
    }
    
    // Update global operation stats with grouped operations
    if (!feesByOperation[groupedOperation]) {
      feesByOperation[groupedOperation] = { count: 0, totalFee: 0, avgFee: 0 };
    }
    const opEntry = feesByOperation[groupedOperation];
    opEntry.count++;
    opEntry.totalFee += tx.fee;
    opEntry.avgFee = opEntry.totalFee / opEntry.count;

    // Update fleet stats using fleet NAME to avoid duplicates
    const fleetKey = involvedFleetName || 'NONE';
    
    if (!feesByFleet[fleetKey]) {
      feesByFleet[fleetKey] = { totalFee: 0, feePercentage: 0, totalOperations: 0, operations: {} };
    }
    const fleetEntry = feesByFleet[fleetKey];
    fleetEntry.totalFee += tx.fee;
    if (!fleetEntry.operations[groupedOperation]) {
      fleetEntry.operations[groupedOperation] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0 };
    }
    const fleetOp = fleetEntry.operations[groupedOperation];
    fleetOp.count++;
    fleetOp.totalFee += tx.fee;
    fleetOp.avgFee = fleetOp.totalFee / fleetOp.count;
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
  console.log('\n🚀 Fleet operations:');
  Object.entries(feesByFleet).forEach(([fleet, data]) => {
    const totalOps = Object.values(data.operations).reduce((sum: number, op: any) => sum + op.count, 0);
    console.log(`  ${fleet}: ${totalOps} total operations, ${(data.totalFee / 1000000000).toFixed(6)} SOL`);
  });

  return {
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h,
    sageFees24h,
    transactionCount24h: recent24h.length,
    feesByFleet,
    feesByOperation,
    transactions: recent24h,
    unknownOperations
  };
}
