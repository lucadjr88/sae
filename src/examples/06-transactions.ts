import { Connection, PublicKey, ConfirmedSignatureInfo, ParsedTransactionWithMeta } from "@solana/web3.js";
import { newConnection } from '../utils/anchor-setup.js';
import { getCacheDataOnly, setCache } from '../utils/persist-cache.js';

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
  limit: number = 50,
  sinceUnixMs?: number,
  maxSignatures: number = 5000,
  opts?: { refresh?: boolean }
): Promise<{ transactions: TransactionInfo[], totalSignaturesFetched: number }> {
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const pubkey = new PublicKey(accountPubkey);

  // Persistent cache key for this query shape
  const cacheKey = `${accountPubkey}__since=${sinceUnixMs || 0}__limit=${limit}__max=${maxSignatures}`;
  const refresh = !!(opts && opts.refresh);
  if (!refresh) {
    const cached = await getCacheDataOnly<{ transactions: TransactionInfo[], totalSignaturesFetched: number }>('transactions', cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Paginate signatures until reaching cutoff or maxSignatures
  const allSignatures: ConfirmedSignatureInfo[] = [] as any;
  let before: string | undefined = undefined;
  let done = false;
  while (!done) {
    const batch = await connection.getSignaturesForAddress(pubkey, { limit: Math.min(1000, limit), before });
    if (batch.length === 0) break;
    
    // Filter only signatures within time window
    for (const sig of batch) {
      if (sinceUnixMs && sig.blockTime && (sig.blockTime * 1000) < sinceUnixMs) {
        // Found transaction older than cutoff, stop here
        done = true;
        break;
      }
      allSignatures.push(sig);
      if (allSignatures.length >= maxSignatures || allSignatures.length >= limit) {
        done = true;
        break;
      }
    }
    
    if (!done && batch.length > 0) {
      const last = batch[batch.length - 1];
      before = last.signature;
    } else {
      done = true;
    }
  }

  const totalSigs = allSignatures.length;
  console.log(`📊 Fetched ${totalSigs} signatures for ${accountPubkey.substring(0, 8)}...`);

  // Get transaction details
  const transactions: TransactionInfo[] = [];
  let processedCount = 0;
  const startTime = Date.now();

  for (const sig of allSignatures) {
    processedCount++;
    
    // Progress logging every 25 transactions (more frequent updates)
    if (processedCount % 25 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processedCount / (Date.now() - startTime) * 1000).toFixed(1);
      const pct = ((processedCount / totalSigs) * 100).toFixed(1);
      console.log(`[tx-details] ${processedCount}/${totalSigs} txs (${pct}%, ${elapsed}s, ${rate} tx/s)`);
    }
    
    // Shorter delay every 50 transactions (was 10 with 200ms, now 50 with 100ms)
    if (processedCount % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Skip if already outside time window (defensive check)
    if (sinceUnixMs && sig.blockTime && (sig.blockTime * 1000) < sinceUnixMs) {
      console.log(`[tx-details] Cutoff reached at tx ${processedCount}`);
      break;
    }
    
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
  // Save to persistent cache for reuse across restarts
  const result = { transactions, totalSignaturesFetched: totalSigs };
  await setCache('transactions', cacheKey, result);
  return result;
}

export async function getFleetTransactions(
  rpcEndpoint: string,
  rpcWebsocket: string,
  fleetAccountPubkey: string,
  limit: number = 50,
  opts?: { refresh?: boolean }
): Promise<{
  fleetAccount: string;
  totalTransactions: number;
  transactions: TransactionInfo[];
}> {
  const result = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    fleetAccountPubkey,
    limit || 50,
    undefined,
    5000,
    opts
  );

  return {
    fleetAccount: fleetAccountPubkey,
    totalTransactions: result.transactions.length,
    transactions: result.transactions
  };
}

export async function getWalletSageTransactions(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  limit: number = 100,
  opts?: { refresh?: boolean }
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
  
  const result = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    limit,
    undefined,
    5000,
    opts
  );
  const allTransactions = result.transactions;

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

export async function getWalletSageFeesDetailedStreaming(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  fleetRentalStatus: { [account: string]: boolean } = {},
  hours: number = 24,
  sendUpdate: (data: any) => void,
  saveProgress?: (partialResult: any) => Promise<void>
): Promise<any> {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const BATCH_SIZE = 100;
  const MAX_TRANSACTIONS = 1000; // Reduced to stay under rate limits (was 5000)
  
  const excludeAccounts = [
    'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
    'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr',
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ];
  
  const specificFleetAccounts = fleetAccounts.filter(account => 
    account && !excludeAccounts.includes(account) && account.length > 40
  );
  
  const now = Date.now();
  const cutoffTime = now - (hours * 60 * 60 * 1000);
  const pubkey = new PublicKey(walletPubkey);
  
  // Dynamic delay system - Ultra-conservative for Helius Free tier (10 RPS hard limit)
  // The library's internal retry happens BEFORE our code sees the error
  // Must be conservative enough to NEVER trigger 429 in the first place
  // Start at 1 RPS (1000ms) to account for concurrent requests from fleet discovery
  let currentDelay = 1000; // ms - start at 1 request per second
  let consecutiveErrors = 0;
  const MIN_DELAY = 500;       // Minimum: 2 RPS (very conservative)
  const MAX_DELAY = 5000;      // Maximum backoff: 5 seconds
  const BACKOFF_MULTIPLIER = 2.0;  // Double delay on 429 (aggressive backoff)
  const SUCCESS_REDUCTION = 0.98;  // Reduce delay VERY slowly (2% per success)
  const MAX_RETRIES = 5;       // Max retry attempts per request
  
  // Step 1: Fetch signatures with 24h OR 5000 limit
  sendUpdate({ type: 'progress', stage: 'signatures', message: 'Fetching signatures...', processed: 0, total: 0 });
  
  const allSignatures: ConfirmedSignatureInfo[] = [];
  let before: string | undefined = undefined;
  let done = false;
  
  while (!done && allSignatures.length < MAX_TRANSACTIONS) {
    // Apply delay before each signature fetch batch
    if (allSignatures.length > 0) {
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
    
    // Retry logic for getSignaturesForAddress with dynamic delay
    let batch: ConfirmedSignatureInfo[] = [];
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        batch = await connection.getSignaturesForAddress(pubkey, { limit: 200, before });
        // Success - reduce delay gradually
        consecutiveErrors = 0;
        currentDelay = Math.max(MIN_DELAY, Math.floor(currentDelay * SUCCESS_REDUCTION));
        break;
      } catch (error: any) {
        if (error.message && error.message.includes('429')) {
          consecutiveErrors++;
          retries++;
          currentDelay = Math.min(MAX_DELAY, Math.floor(currentDelay * BACKOFF_MULTIPLIER));
          const waitTime = currentDelay * retries;
          console.log(`[429 signatures] Rate limit hit. Waiting ${waitTime}ms (delay now: ${currentDelay}ms, retry: ${retries}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          if (retries >= MAX_RETRIES) {
            console.error(`[429 signatures] Max retries reached for getSignaturesForAddress`);
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
    
    if (batch.length === 0) break;
    
    for (const sig of batch) {
      if (sig.blockTime && (sig.blockTime * 1000) < cutoffTime) {
        done = true;
        break;
      }
      allSignatures.push(sig);
      if (allSignatures.length >= MAX_TRANSACTIONS) {
        done = true;
        break;
      }
    }
    
    if (!done && batch.length > 0) {
      before = batch[batch.length - 1].signature;
    } else {
      done = true;
    }
  }
  
  const totalSigs = allSignatures.length;
  sendUpdate({ type: 'progress', stage: 'signatures', message: `Found ${totalSigs} signatures`, processed: totalSigs, total: totalSigs });
  
  // Step 2: Process transactions in batches of 100
  const feesByFleet: any = {};
  const feesByOperation: any = {};
  let totalFees24h = 0;
  let sageFees24h = 0;
  let unknownOperations = 0;
  const processedTransactions: TransactionInfo[] = [];
  
  // Reset consecutive errors counter for transaction processing phase
  consecutiveErrors = 0;
  
  const OP_MAP: { [key: string]: string } = {
    'StartMiningAsteroid': 'Mining',
    'StopMiningAsteroid': 'Mining',
    'IdleToLoadingBay': 'Cargo/Dock',
    'LoadingBayToIdle': 'Cargo/Dock',
    'WithdrawCargoFromFleet': 'Cargo/Dock',
    'DepositCargoToFleet': 'Cargo/Dock',
    'StartSubwarp': 'Subwarp',
    'StopSubwarp': 'Subwarp',
    'WarpToCoordinate': 'Warp',
    'ScanForSurveyDataUnits': 'ScanSDU',
    'DockedToLoadingBay': 'Cargo/Dock',
    'FleetStateHandler': 'Mining',
    'ConsumeCargo': 'Mining',
    'Craft': 'Crafting',
    'craft': 'Crafting',
    'StarbaseUpgradeForFaction': 'StarbaseUpgradeSubmit',
    'CraftingProcessCraftingMaterial': 'CraftBurn',
  };
  
  let txProcessed = 0;
  const cacheSavePromises: Promise<void>[] = []; // Track async cache saves
  
  for (let i = 0; i < allSignatures.length; i += BATCH_SIZE) {
    const batchSigs = allSignatures.slice(i, Math.min(i + BATCH_SIZE, allSignatures.length));
    const batchStart = Date.now();
    
    for (const sig of batchSigs) {
      // Skip if outside time window
      if (sig.blockTime && (sig.blockTime * 1000) < cutoffTime) continue;
      
      // Apply delay BEFORE every transaction (not every 10)
      if (txProcessed > 0) {
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
      
      let retries = 0;
      const MAX_RETRIES = 5;
      let tx = null;
      
      while (retries < MAX_RETRIES) {
        try {
          tx = await connection.getParsedTransaction(sig.signature, { 
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });
          
          // Success - reduce delay gradually
          consecutiveErrors = 0;
          currentDelay = Math.max(MIN_DELAY, Math.floor(currentDelay * SUCCESS_REDUCTION));
          break;
          
        } catch (error: any) {
          if (error.message && error.message.includes('429')) {
            consecutiveErrors++;
            retries++;
            
            // Increase delay exponentially
            currentDelay = Math.min(MAX_DELAY, Math.floor(currentDelay * BACKOFF_MULTIPLIER));
            
            const waitTime = currentDelay * (retries + 1);
            console.log(`[429] Rate limit hit. Waiting ${waitTime}ms (delay now: ${currentDelay}ms, errors: ${consecutiveErrors})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
          } else {
            console.error(`[tx-error] ${error.message}`);
            break;
          }
        }
      }
      
      if (!tx) {
        txProcessed++;
        continue;
      }
      
      const programIds = tx.transaction.message.instructions
        .map((ix: any) => ix.programId?.toString())
        .filter((id: any) => id);
      
      const instructions: string[] = [];
      const logMessages: string[] = tx.meta?.logMessages || [];
      
      logMessages.forEach(log => {
        const ixMatch = log.match(/Instruction: (\w+)/);
        if (ixMatch) instructions.push(ixMatch[1]);
      });
      
      const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
      const fee = tx.meta?.fee || 0;
      
      const txInfo: TransactionInfo = {
        signature: sig.signature,
        blockTime: sig.blockTime || 0,
        slot: sig.slot,
        err: sig.err,
        timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'Unknown',
        status: sig.err ? 'failed' : 'success',
        fee,
        programIds,
        instructions,
        logMessages,
        accountKeys
      };
      
      processedTransactions.push(txInfo);
      totalFees24h += fee;
      txProcessed++;
      
      if (!programIds.includes(SAGE_PROGRAM_ID)) continue;
      sageFees24h += fee;
      
      // Determine operation
      let operation = 'Unknown';
      if (instructions.length > 0) {
        for (const instr of instructions) {
          if (OP_MAP[instr]) {
            operation = OP_MAP[instr];
            break;
          }
        }
      }
      
      if (operation === 'Unknown') unknownOperations++;
      
      // Find involved fleet
      let involvedFleetName = 'Other Operations';
      for (const fleet of specificFleetAccounts) {
        if (accountKeys.includes(fleet)) {
          involvedFleetName = fleetAccountNames[fleet] || fleet.substring(0, 8);
          break;
        }
      }
      
      // Aggregate by fleet
      if (!feesByFleet[involvedFleetName]) {
        feesByFleet[involvedFleetName] = {
          totalFee: 0,
          feePercentage: 0,
          totalOperations: 0,
          operations: {},
          isRented: fleetRentalStatus[involvedFleetName] || false
        };
      }
      
      feesByFleet[involvedFleetName].totalFee += fee;
      feesByFleet[involvedFleetName].totalOperations++;
      
      if (!feesByFleet[involvedFleetName].operations[operation]) {
        feesByFleet[involvedFleetName].operations[operation] = {
          count: 0,
          totalFee: 0,
          avgFee: 0,
          percentageOfFleet: 0
        };
      }
      
      feesByFleet[involvedFleetName].operations[operation].count++;
      feesByFleet[involvedFleetName].operations[operation].totalFee += fee;
      
      // Aggregate by operation
      if (!feesByOperation[operation]) {
        feesByOperation[operation] = { count: 0, totalFee: 0, avgFee: 0 };
      }
      feesByOperation[operation].count++;
      feesByOperation[operation].totalFee += fee;
    }
    
    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);
    const processed = Math.min(i + BATCH_SIZE, allSignatures.length);
    const pct = ((processed / totalSigs) * 100).toFixed(1);
    
    // Calculate current percentages for this batch
    Object.keys(feesByOperation).forEach(op => {
      feesByOperation[op].avgFee = feesByOperation[op].totalFee / feesByOperation[op].count;
    });
    
    Object.keys(feesByFleet).forEach(fleet => {
      feesByFleet[fleet].feePercentage = sageFees24h > 0 ? (feesByFleet[fleet].totalFee / sageFees24h) * 100 : 0;
      Object.keys(feesByFleet[fleet].operations).forEach(op => {
        const opData = feesByFleet[fleet].operations[op];
        opData.avgFee = opData.totalFee / opData.count;
        opData.percentageOfFleet = feesByFleet[fleet].totalFee > 0 ? (opData.totalFee / feesByFleet[fleet].totalFee) * 100 : 0;
      });
    });
    
    // Build partial result for this batch
    const partialResult = {
      type: 'progress',
      stage: 'transactions',
      message: `Processing batch ${Math.floor(i/BATCH_SIZE) + 1} (delay: ${currentDelay}ms)`,
      processed,
      total: totalSigs,
      percentage: pct,
      batchTime,
      currentDelay,
      walletAddress: walletPubkey,
      period: `Last ${hours} hours`,
      totalFees24h,
      sageFees24h,
      transactionCount24h: processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID)).length,
      totalSignaturesFetched: totalSigs,
      feesByFleet: { ...feesByFleet },
      feesByOperation: { ...feesByOperation },
      unknownOperations,
      rentedFleetAccounts: Object.keys(fleetRentalStatus).filter(k => fleetRentalStatus[k]),
      fleetAccountNamesEcho: fleetAccountNames,
      fleetRentalStatusFinal: fleetRentalStatus
    };
    
    // Send progressive update
    sendUpdate(partialResult);
    
    // Save incremental cache asynchronously (don't await - do it in parallel)
    if (saveProgress) {
      const cachePromise = saveProgress(partialResult).catch(err => {
        console.error('[stream] Incremental cache save failed:', err);
      });
      cacheSavePromises.push(cachePromise);
    }
    
    // No fixed delay - using dynamic delay per transaction instead
  }
  
  // Wait for all pending cache saves to complete before finishing
  if (cacheSavePromises.length > 0) {
    console.log(`[stream] Waiting for ${cacheSavePromises.length} pending cache saves...`);
    await Promise.all(cacheSavePromises);
    console.log(`[stream] All incremental caches saved`);
  }
  
  console.log(`[stream] Completed processing with final delay: ${currentDelay}ms, total 429 errors: ${consecutiveErrors}`);
  
  // Calculate percentages
  Object.keys(feesByOperation).forEach(op => {
    feesByOperation[op].avgFee = feesByOperation[op].totalFee / feesByOperation[op].count;
  });
  
  Object.keys(feesByFleet).forEach(fleet => {
    feesByFleet[fleet].feePercentage = sageFees24h > 0 ? (feesByFleet[fleet].totalFee / sageFees24h) * 100 : 0;
    Object.keys(feesByFleet[fleet].operations).forEach(op => {
      const opData = feesByFleet[fleet].operations[op];
      opData.avgFee = opData.totalFee / opData.count;
      opData.percentageOfFleet = feesByFleet[fleet].totalFee > 0 ? (opData.totalFee / feesByFleet[fleet].totalFee) * 100 : 0;
    });
  });
  
  // Send final complete result and return it for caching
  const finalResult = {
    type: 'complete',
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h,
    sageFees24h,
    transactionCount24h: processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID)).length,
    totalSignaturesFetched: totalSigs,
    feesByFleet,
    feesByOperation,
    unknownOperations,
    rentedFleetAccounts: Object.keys(fleetRentalStatus).filter(k => fleetRentalStatus[k]),
    fleetAccountNamesEcho: fleetAccountNames,
    fleetRentalStatusFinal: fleetRentalStatus
  };
  
  console.log(`[stream] Sending final complete message with ${finalResult.transactionCount24h} transactions`);
  sendUpdate(finalResult);
  console.log(`[stream] Final message sent`);
  return finalResult;
}

export async function getWalletSageFeesDetailed(
  rpcEndpoint: string,
  rpcWebsocket: string,
  walletPubkey: string,
  fleetAccounts: string[],
  fleetAccountNames: { [account: string]: string } = {},
  fleetRentalStatus: { [account: string]: boolean } = {},
  hours: number = 24,
  opts?: { refresh?: boolean }
): Promise<{
  walletAddress: string;
  period: string;
  totalFees24h: number;
  sageFees24h: number;
  transactionCount24h: number;
  totalSignaturesFetched: number;
  feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; isRented?: boolean; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number } } } };
  feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number } };
  transactions: TransactionInfo[];
  unknownOperations: number;
  // Extra mapping to strengthen rental attribution on the client
  rentedFleetAccounts: string[];
  fleetAccountNamesEcho: { [account: string]: string };
  fleetRentalStatusFinal: { [account: string]: boolean };
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
    '11111111111111111111111111111111', // System Program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  ];
  
  // Filter out generic accounts from fleet accounts
  const specificFleetAccounts = fleetAccounts.filter(account => 
    account && !excludeAccounts.includes(account) && account.length > 40
  );
  
  console.log(`[DEBUG] Specific fleet accounts (after filtering): ${specificFleetAccounts.length}`);
  specificFleetAccounts.forEach((fleet, i) => console.log(`  Specific Fleet ${i}: ${fleet.substring(0, 8)}...`));
  
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
    opts
  );
  const allTransactions = result.transactions;
  const totalSigs = result.totalSignaturesFetched;
  
  const recent24h = allTransactions.filter(tx => {
    const txTime = new Date(tx.timestamp).getTime();
    return txTime >= cutoffTime && tx.programIds.includes(SAGE_PROGRAM_ID);
  });

  // Analyze by fleet and operation
  const feesByFleet: { [fleetAccount: string]: { totalFee: number; feePercentage: number; totalOperations: number; isRented?: boolean; operations: { [operation: string]: { count: number; totalFee: number; avgFee: number; percentageOfFleet: number } } } } = {};
  const feesByOperation: { [operation: string]: { count: number; totalFee: number; avgFee: number } } = {};
  let totalFees24h = 0;
  let sageFees24h = 0;
  let unknownOperations = 0;
  
  // Track which fleets have rental operations
  const rentedFleets = new Set<string>();

  // Complete SAGE instruction mapping from official IDL (SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE)
  // Source: https://github.com/staratlasmeta/star-atlas-decoders
  const OP_MAP: { [key: string]: string } = {
    // Fleet Movement & State
    'createFleet': 'CreateFleet',
    'disbandFleet': 'DisbandFleet',
    'forceDisbandFleet': 'ForceDisbandFleet',
    'disbandedFleetToEscrow': 'DisbandedFleetToEscrow',
    'closeDisbandedFleet': 'CloseDisbandedFleet',
    'idleToLoadingBay': 'Dock',
    'loadingBayToIdle': 'Undock',
    'idleToRespawn': 'IdleToRespawn',
    'loadingBayToRespawn': 'LoadingBayToRespawn',
    'respawnToLoadingBay': 'Respawn',
    'mineAsteroidToRespawn': 'MineToRespawn',
    
    // Warp & Movement
    'startSubwarp': 'StartSubwarp',
    'stopSubwarp': 'StopSubwarp',
    'warpToCoordinate': 'WarpToCoord',
    'warpLane': 'WarpLane',
    'planetExitWarp': 'PlanetExitWarp',
    
    // Mining
    'startMiningAsteroid': 'StartMining',
    'stopMiningAsteroid': 'StopMining',
    
    // Scanning
    'scanForSurveyDataUnits': 'ScanSDU',
    'dropExpiredSurveyDataUnits': 'DropExpiredSDU',
    
    // Fleet Cargo Operations
    'depositCargoToFleet': 'LoadCargo',
    'withdrawCargoFromFleet': 'UnloadCargo',
    'transferCargoWithinFleet': 'TransferCargoFleet',
    
    // Game Cargo Operations  
    'depositCargoToGame': 'DepositCargoGame',
    'withdrawCargoFromGame': 'WithdrawCargoGame',
    
    // Starbase Cargo Operations
    'transferCargoAtStarbase': 'TransferCargoStarbase',
    'createCargoPod': 'CreateCargoPod',
    'removeCargoPod': 'RemoveCargoPod',
    
    // Fleet Management
    'addShipToFleet': 'AddShip',
    'addShipEscrowToFleet': 'AddShipEscrow',
    'removeShipEscrow': 'RemoveShipEscrow',
    'updateShipEscrow': 'UpdateShipEscrow',
    'updateShipInFleet': 'UpdateShipInFleet',
    'loadFleetCrew': 'LoadCrew',
    'unloadFleetCrew': 'UnloadCrew',
    'rearmFleet': 'Rearm',
    'refuelFleet': 'Refuel',
    
    // Crafting
    'createCraftingProcess': 'CraftStart',
    'startCraftingProcess': 'CraftStart',
    'stopCraftingProcess': 'CraftStop',
    'cancelCraftingProcess': 'CraftCancel',
    'closeCraftingProcess': 'CraftClose',
    'claimCraftingOutputs': 'CraftClaim',
    'claimCraftingNonConsumables': 'CraftClaimNonCons',
    'depositCraftingIngredient': 'CraftDeposit',
    'withdrawCraftingIngredient': 'CraftWithdraw',
    'burnCraftingConsumables': 'CraftBurn',
    
    // Starbase Crafting
    'createStarbaseCraftingProcess': 'StarbaseCraftStart',
    'closeStarbaseCraftingProcess': 'StarbaseCraftClose',
    'closeResourceCraftingProcess': 'ResourceCraftClose',
    
    // Starbase Operations
    'startStarbaseUpgrade': 'StarbaseUpgradeStart',
    'completeStarbaseUpgrade': 'StarbaseUpgradeComplete',
    'submitStarbaseUpgradeResource': 'StarbaseUpgradeSubmit',
    'depositStarbaseUpkeepResource': 'StarbaseUpkeepDeposit',
    'registerStarbase': 'RegisterStarbase',
    'registerStarbasePlayer': 'RegisterStarbasePlayer',
    'deregisterStarbase': 'DeregisterStarbase',
    'updateStarbase': 'UpdateStarbase',
    
    // Crew
    'addCrewToGame': 'AddCrew',
    'removeCrewFromGame': 'RemoveCrew',
    'closePlayerCrewRecord': 'CloseCrewRecord',
    'registerSageCrewConfig': 'RegisterCrewConfig',
    'devAddCrewToGame': 'DevAddCrew',
    
    // Sector & Discovery
    'discoverSector': 'DiscoverSector',
    'registerSector': 'RegisterSector',
    'updateSector': 'UpdateSector',
    'addConnection': 'AddConnection',
    'removeConnection': 'RemoveConnection',
    
    // Resources & Mining Items
    'registerMineItem': 'RegisterMineItem',
    'deregisterMineItem': 'DeregisterMineItem',
    'updateMineItem': 'UpdateMineItem',
    'registerResource': 'RegisterResource',
    'deregisterResource': 'DeregisterResource',
    'updateResource': 'UpdateResource',
    
    // Ships
    'registerShip': 'RegisterShip',
    'setNextShip': 'SetNextShip',
    'invalidateShip': 'InvalidateShip',
    
    // Planets & Stars
    'registerPlanet': 'RegisterPlanet',
    'updatePlanet': 'UpdatePlanet',
    'registerStar': 'RegisterStar',
    'updateStar': 'UpdateStar',
    
    // Game Management
    'initGame': 'InitGame',
    'initGameState': 'InitGameState',
    'manageGame': 'ManageGame',
    'updateGame': 'UpdateGame',
    'updateGameState': 'UpdateGameState',
    
    // Player Profile
    'registerSagePlayerProfile': 'RegisterProfile',
    
    // Progression
    'registerProgressionConfig': 'RegisterProgression',
    'deregisterProgressionConfig': 'DeregisterProgression',
    'updateProgressionConfig': 'UpdateProgression',
    'registerSagePointsModifier': 'RegisterPointsModifier',
    
    // Survey Data Units
    'registerSurveyDataUnitTracker': 'RegisterSDUTracker',
    'deregisterSurveyDataUnitTracker': 'DeregisterSDUTracker',
    'updateSurveyDataUnitTracker': 'UpdateSDUTracker',
    
    // Rental
    'addRental': 'AddRental',
    'changeRental': 'ChangeRental',
    'invalidateRental': 'InvalidateRental',
    'enableSubProfileInvalidator': 'EnableSubProfileInvalidator',
    
    // Certificates
    'registerCertificate': 'RegisterCertificate',
    
    // Dev Tools
    'devDepositCargoToGame': 'DevDepositCargo',
    'DepositCargoToFleet': 'LoadCargo',
    'WithdrawCargoFromFleet': 'UnloadCargo',
    'WarpToCoordinate': 'Warp',
    'Craft': 'Crafting',
    'craft': 'Crafting'
  };

  for (const tx of recent24h) {
    totalFees24h += tx.fee;
    if (!tx.programIds.includes(SAGE_PROGRAM_ID)) continue;
    sageFees24h += tx.fee;

    // Determine operation using MULTIPLE sources with enhanced patterns
    let operation = 'Unknown';
    let foundMethod = 'none';
    
    // Method 1: Check instruction names from transaction (most reliable)
    if (tx.instructions && tx.instructions.length > 0) {
      for (const instr of tx.instructions) {
        // Direct mapping check
        if (OP_MAP[instr]) {
          operation = OP_MAP[instr];
          foundMethod = 'instruction_direct';
          break;
        }
        
        // Case-insensitive partial match
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
    
    // Method 2: Check log messages for instruction patterns
    if (operation === 'Unknown' && tx.logMessages) {
      for (const log of tx.logMessages) {
        // Look for "Instruction: <name>" pattern in logs
        const ixMatch = log.match(/Instruction:\s*(\w+)/i);
        if (ixMatch) {
          const ixName = ixMatch[1];
          if (OP_MAP[ixName]) {
            operation = OP_MAP[ixName];
            foundMethod = 'log_instruction';
            break;
          }
        }
        
        // Direct keyword matching from OP_MAP
        for (const [key, value] of Object.entries(OP_MAP)) {
          if (log.includes(key)) {
            operation = value;
            foundMethod = 'log_direct';
            break;
          }
        }
        
        if (operation !== 'Unknown') break;
      }
    }
    
    // Method 3: Pattern-based detection for common operations
    if (operation === 'Unknown' && tx.logMessages) {
      const logsLower = tx.logMessages.join(' ').toLowerCase();
      
      if (logsLower.includes('craft')) {
        operation = 'Crafting';
        foundMethod = 'pattern_craft';
      } else if (logsLower.includes('mine') || logsLower.includes('mining')) {
        if (logsLower.includes('start')) {
          operation = 'StartMining';
        } else if (logsLower.includes('stop')) {
          operation = 'StopMining';
        } else {
          operation = 'Mining';
        }
        foundMethod = 'pattern_mining';
      } else if (logsLower.includes('subwarp') || logsLower.includes('warp')) {
        if (logsLower.includes('start') || logsLower.includes('enter')) {
          operation = 'StartSubwarp';
        } else if (logsLower.includes('stop') || logsLower.includes('exit') || logsLower.includes('end')) {
          operation = 'EndSubwarp';
        } else {
          operation = 'Subwarp';
        }
        foundMethod = 'pattern_warp';
      } else if (logsLower.includes('scan')) {
        if (logsLower.includes('start')) {
          operation = 'StartScan';
        } else if (logsLower.includes('stop')) {
          operation = 'StopScan';
        } else {
          operation = 'Scan';
        }
        foundMethod = 'pattern_scan';
      } else if (logsLower.includes('dock')) {
        operation = logsLower.includes('undock') ? 'Undock' : 'Dock';
        foundMethod = 'pattern_dock';
      } else if (logsLower.includes('cargo')) {
        operation = logsLower.includes('unload') ? 'UnloadCargo' : 'LoadCargo';
        foundMethod = 'pattern_cargo';
      } else if (logsLower.includes('fuel')) {
        operation = 'Refuel';
        foundMethod = 'pattern_fuel';
      } else if (logsLower.includes('ammo')) {
        operation = 'Rearm';
        foundMethod = 'pattern_ammo';
      }
    }
    
    if (operation === 'Unknown') unknownOperations++;

    // ENHANCED: Find which fleet is involved using multiple strategies
    let involvedFleet: string | undefined = undefined;
    let involvedFleetName: string | undefined = undefined;
    let matchStrategy = 'none';
    
    // Determine if this is a fleet-related operation
    const isFleetOperation = [
      'CreateFleet', 'DisbandFleet', 'Dock', 'Undock', 'StartMining', 'StopMining',
      'StartSubwarp', 'StopSubwarp', 'WarpToCoord', 'WarpLane', 'LoadCargo', 'UnloadCargo',
      'ScanSDU', 'Refuel', 'Rearm', 'AddShip', 'LoadCrew', 'UnloadCrew', 'Respawn'
    ].includes(operation);
    
    if (tx.accountKeys && tx.accountKeys.length > 0 && isFleetOperation) {
      // Strategy 1: Direct fleet account match for fleet operations
      for (const fleet of specificFleetAccounts) {
        if (tx.accountKeys.includes(fleet)) {
          involvedFleet = fleet;
          involvedFleetName = (fleetAccountNames && fleetAccountNames[fleet]) ? fleetAccountNames[fleet] : fleet.substring(0, 8);
          matchStrategy = 'direct';
          break;
        }
      }
    }
    
    // Strategy 2: For non-fleet operations, categorize by operation type
    if (!involvedFleet) {
      // Categorize by operation type instead of using "General"
      if (operation.includes('Craft') || operation.includes('craft')) {
        involvedFleetName = 'Crafting Operations';
        matchStrategy = 'category_craft';
      } else if (operation.includes('Starbase') || operation.includes('starbase')) {
        involvedFleetName = 'Starbase Operations';
        matchStrategy = 'category_starbase';
      } else if (operation.includes('Register') || operation.includes('Deregister') || operation.includes('Update')) {
        involvedFleetName = 'Configuration';
        matchStrategy = 'category_config';
      } else if (operation.includes('Cargo') || operation.includes('cargo')) {
        involvedFleetName = 'Cargo Management';
        matchStrategy = 'category_cargo';
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
    
    // Group related operations (start/stop pairs and logistics)
    let groupedOperation = operation;
    
    if (operation === 'StartSubwarp' || operation === 'StopSubwarp' || operation === 'EndSubwarp') {
      groupedOperation = 'Subwarp';
    } else if (operation === 'StartMining' || operation === 'StopMining') {
      groupedOperation = 'Mining';
    } else if (operation === 'StartScan' || operation === 'StopScan') {
      groupedOperation = 'Scan';
    } else if (operation === 'Dock' || operation === 'Undock' || operation === 'LoadCargo' || operation === 'UnloadCargo') {
      groupedOperation = 'Cargo/Dock';
    } else if (operation === 'CraftStart' || operation === 'CraftClaim' || operation === 'Crafting') {
      groupedOperation = 'Crafting';
    } else if (operation === 'DepositTokens' || operation === 'WithdrawTokens') {
      groupedOperation = 'Token Ops';
    } else if (operation === 'CreateCargoPod' || operation === 'CloseCargoPod' || operation === 'DepositToPod' || operation === 'WithdrawFromPod') {
      groupedOperation = 'Cargo Pods';
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

    // Update fleet stats using fleet NAME to avoid duplicates
    const fleetKey = involvedFleetName || 'NONE';
    
    if (!feesByFleet[fleetKey]) {
      // Initialize fleet entry; rental status computed below per-transaction and OR-ed in
      feesByFleet[fleetKey] = { 
        totalFee: 0, 
        feePercentage: 0, 
        totalOperations: 0, 
        isRented: false,
        operations: {} 
      };
    }
    const fleetEntry = feesByFleet[fleetKey];
    fleetEntry.totalFee += tx.fee;
    // Compute rental status for this tx and propagate
    let txRented = false;
    if (involvedFleet) {
      if (fleetRentalStatus[involvedFleet]) txRented = true;
      if (rentedFleets.has(involvedFleet)) txRented = true;
    }
    fleetEntry.isRented = !!(fleetEntry.isRented || txRented);
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
