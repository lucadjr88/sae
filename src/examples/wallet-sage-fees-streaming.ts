import { TransactionInfo } from './types.js';
import { getAccountTransactions } from './account-transactions.js';
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import { decodeRecipe, isRecipeAccount, decodeCraftingProcess, decodeCraftableItem } from '../decoders/crafting-decoder.js';
import { decodeAccountWithRust } from '../decoders/rust-wrapper.js';
import { resolveMints } from '../utils/metaplex-metadata.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { nlog } from '../utils/log-normalizer.js';

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
  // Costanti e mapping
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const excludeAccounts = [
    'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
    'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr',
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ];

  // Program ID mapping removed - use raw instruction names only

  // Minimal materials map to detect crafting token movements
  const MATERIALS: Record<string, string> = {
    'MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog': 'Biomass',
    'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG': 'Food',
    'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim': 'Fuel',
    'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp': 'Hydrogen',
  };

  // Filter fleetAccounts to only include those with valid cache data (avoid phantom fleets)
  const CACHE_DIR = './cache/fleets';
  const validFleetAccounts = (fleetAccounts || []).filter(key => {
    const filePath = `./cache/fleets/${key}.json`;
    return fs.existsSync(filePath);
  });

  const allowedFleetKeys = new Set<string>(validFleetAccounts);
  const filterFleetBuckets = (buckets: any) => {
    const filtered: Record<string, any> = {};
    Object.entries(buckets || {}).forEach(([k, v]) => {
      if (allowedFleetKeys.has(k)) filtered[k] = v;
    });
    return filtered;
  };
  const fleetNameToKey = new Map<string, string>();
  for (const [k, v] of Object.entries(fleetAccountNames || {})) {
    if (v) {
      if (!fleetNameToKey.has(v)) fleetNameToKey.set(v, k);
      const lc = v.toLowerCase();
      if (!fleetNameToKey.has(lc)) fleetNameToKey.set(lc, k);
    }
    if (!fleetNameToKey.has(k)) fleetNameToKey.set(k, k);
  }
  const resolveFleetKey = (val?: string): string | undefined => {
    if (!val) return undefined;
    if (fleetNameToKey.has(val)) return fleetNameToKey.get(val);
    const lc = val.toLowerCase();
    return fleetNameToKey.get(lc);
  };
  const specificFleetAccounts = fleetAccounts.filter(account => account && !excludeAccounts.includes(account) && account.length > 40);

  // Build sub-account to fleet mapping only if enabled
  const accountToFleet = new Map<string, string>();
  for (const fleetKey of specificFleetAccounts) {
    accountToFleet.set(fleetKey, fleetKey);
    if (!enableSubAccountMapping) continue;
    try {
      const filePath = `./cache/fleets/${fleetKey}.json`;
      if (fs.existsSync(filePath)) {
        const cacheData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fleetData = cacheData.data?.data;
        if (fleetData) {
          if (fleetData.cargoHold) accountToFleet.set(fleetData.cargoHold, fleetKey);
          if (fleetData.fuelTank) accountToFleet.set(fleetData.fuelTank, fleetKey);
          if (fleetData.ammoBank) accountToFleet.set(fleetData.ammoBank, fleetKey);
          if (fleetData.fleetShips) accountToFleet.set(fleetData.fleetShips, fleetKey);
          if (fleetData.ownerProfile) accountToFleet.set(fleetData.ownerProfile, fleetKey);
          if (fleetData.subProfile && fleetData.subProfile.key && fleetData.subProfile.key !== '11111111111111111111111111111111') {
            accountToFleet.set(fleetData.subProfile.key, fleetKey);
          }
        }
      }
    } catch (e) {}
  }

  const now = Date.now();
  const cutoffTime = now - (hours * 60 * 60 * 1000);
  const CRAFT_PROGRAM_ID = 'CRAFT2RPXPJWCEix4WpJST3E7NLf79GTqZUL75wngXo5';
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Parametri batch e rate limiting
  const BATCH_SIZE = 150;
  const MAX_TRANSACTIONS = 3000;
  const MIN_DELAY = 70;
  const MAX_DELAY = 5000;
  const BACKOFF_MULTIPLIER = 1.5;
  const SUCCESS_PROBE_WINDOW = 25;
  const SUCCESS_DECREASE_STEP = 5;
  const JITTER_PCT = 0.10;
  const MAX_RETRIES = 5;
  let currentDelay = MIN_DELAY;
  let successStreak = 0;
  let consecutiveErrors = 0;

  // Gestione incrementale/cache
  let isIncrementalUpdate = !!(cachedData && lastProcessedSignature);
  if (refresh) isIncrementalUpdate = false; // Forza ricalcolo completo per refresh
  let feesByFleet: any = isIncrementalUpdate && cachedData ? filterFleetBuckets({ ...cachedData.feesByFleet }) : {};
  let feesByOperation: any = isIncrementalUpdate && cachedData ? { ...cachedData.feesByOperation } : {};
  let totalFees24h = isIncrementalUpdate && cachedData ? (cachedData.totalFees24h || 0) : 0;
  let sageFees24h = isIncrementalUpdate && cachedData ? (cachedData.sageFees24h || 0) : 0;
  let unknownOperations = 0;
  let processedTransactions: TransactionInfo[] = [];
  const rentedFleets = new Set<string>();
  const cacheSavePromises: Promise<void>[] = [];

  // Create a single reusable RPC pool connection for crafting details
  const sharedPoolConnection = new RpcPoolConnection(connection);

  // Retry logic for signature fetch with conservative settings
  let retryCount = 0;
  const MAX_FETCH_RETRIES = 3;
  let fetchBatchSize = MAX_TRANSACTIONS; // Start with full
  let fetchDelay = MIN_DELAY; // Start with normal
  let result: any = null;
  let allTransactions: any[] = [];
  let totalSigs = 0;

  while (retryCount < MAX_FETCH_RETRIES) {
    try {
      sendUpdate({ type: 'progress', stage: 'signatures', message: `Fetching signatures... (attempt ${retryCount + 1}/${MAX_FETCH_RETRIES})`, processed: 0, total: 0 });
      result = await getAccountTransactions(
        rpcEndpoint,
        rpcWebsocket,
        walletPubkey,
        fetchBatchSize,
        cutoffTime,
        fetchBatchSize,
        { refresh }
      );
      allTransactions = result.transactions;
      totalSigs = result.totalSignaturesFetched;
      
      if (totalSigs > 0) {
        // Success: exit retry loop
        sendUpdate({ type: 'progress', stage: 'signatures', message: `Found ${totalSigs} signatures`, processed: totalSigs, total: totalSigs });
        break;
      } else {
        // No signatures: likely rate limited, retry with conservative settings
        retryCount++;
        if (retryCount < MAX_FETCH_RETRIES) {
          fetchBatchSize = Math.max(500, fetchBatchSize / 2); // Halve batch size (min 500)
          fetchDelay = Math.min(MAX_DELAY, fetchDelay * 2); // Double delay (max 5000ms)
          console.log(`[stream] Fetch retry ${retryCount}/${MAX_FETCH_RETRIES} with batchSize=${fetchBatchSize}, delay=${fetchDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, fetchDelay * 10)); // Wait longer between retries (up to 50s)
        }
      }
    } catch (err) {
      retryCount++;
      if (retryCount >= MAX_FETCH_RETRIES) {
        console.error('[stream] Fetch failed after retries:', (err as any).message);
        throw err; // Re-throw to abort
      }
      fetchBatchSize = Math.max(500, fetchBatchSize / 2);
      fetchDelay = Math.min(MAX_DELAY, fetchDelay * 2);
      console.log(`[stream] Fetch error retry ${retryCount}/${MAX_FETCH_RETRIES}: ${(err as any).message}`);
      await new Promise(resolve => setTimeout(resolve, fetchDelay * 10));
    }
  }

  if (totalSigs === 0) {
    console.warn('[stream] Unable to fetch any signatures after retries, proceeding with empty data');
    sendUpdate({ type: 'progress', stage: 'signatures', message: 'No signatures found (rate limited)', processed: 0, total: 0 });
  }

  // Fase 2: Batch processing e parsing avanzato
  for (let i = 0; i < allTransactions.length; i += BATCH_SIZE) {
    const batch = allTransactions.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();
    for (const tx of batch) {
      // Don't skip transactions with empty instructions - they might still be valid SAGE transactions
      // The programIds check below will filter out non-SAGE transactions

      // --- AGGIORNA I TOTALI FEE 24H ---
      totalFees24h += tx.fee;
      if (tx.programIds && tx.programIds.includes(SAGE_PROGRAM_ID)) {
        sageFees24h += tx.fee;
      }

      // Determine operation using raw instruction names
      let operation = 'Unknown';
      let isCrafting = false;
      let craftingMaterial = undefined;
      let craftingType = undefined;
      let hasSageInstruction = false;

      if (tx.instructions && tx.instructions.length > 0) {
        // Priorità alle istruzioni SAGE (nomi che iniziano con maiuscola e non sono generici)
        const sageIx = tx.instructions.find((ix: string) => 
          typeof ix === 'string' && 
          ix !== 'Unknown' && 
          !['ComputeBudget', 'Approve', 'Burn', 'Transfer', 'IncrementPoints'].includes(ix)
        );
        if (sageIx) {
          operation = sageIx;
          hasSageInstruction = true;
          if (sageIx.toLowerCase().includes('craft')) {
            isCrafting = true;
            craftingType = sageIx;
          }
        } else {
          operation = tx.instructions[0] || 'Unknown';
        }
      }

      if (operation === 'Unknown' && tx.logMessages) {
        for (const log of tx.logMessages) {
          const ixMatch = log.match(/Instruction:\s*(\w+)/);
          if (ixMatch) {
            operation = ixMatch[1];
            hasSageInstruction = true;
            if (operation.toLowerCase().includes('craft')) {
              isCrafting = true;
              craftingType = operation;
            }
            break;
          }
        }
      }

      // console.log(`[DEBUG] Final operation: ${operation} for tx ${tx.signature.substring(0,8)}... (programIds: ${tx.programIds.join(', ')})`);

      // Skip ONLY pure non-SAGE transactions (no SAGE program ID at all)
      if (!tx.programIds.includes(SAGE_PROGRAM_ID)) {
        continue;
      }
      // Raffinamento FleetStateHandler
      if (operation === 'FleetStateHandler' && tx.logMessages) {
        const logsJoined = tx.logMessages.join(' ');
        const logsLower = logsJoined.toLowerCase();
        if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) {
          operation = 'FleetStateHandler_subwarp';
        } else if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) {
          operation = 'FleetStateHandler_mining';
        } else if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) {
          operation = 'FleetStateHandler_loading_bay';
        }
      }

      // Aggiungi la transazione SAGE processata all'array per conteggi e timestamp
      (tx as any).operation = operation;
      processedTransactions.push(tx);

      // Raw instruction extraction complete - no additional normalization

      // 3. Parsing innerInstructions per materiali (migliorato)
      if (isCrafting && tx.meta && Array.isArray((tx.meta as any).innerInstructions)) {
        for (const blk of (tx.meta as any).innerInstructions) {
          if (!blk || !Array.isArray(blk.instructions)) continue;
          for (const iin of blk.instructions) {
            // Prova a estrarre materiale da parsed, program, e dati
            const candidates = [iin?.parsed?.destination, iin?.parsed?.mint, iin?.parsed?.token, iin?.parsed?.authority, iin?.parsed?.source, iin?.program, iin?.data];
            for (const val of candidates) {
              if (typeof val === 'string') {
                if (/fuel/i.test(val)) craftingMaterial = 'Fuel';
                else if (/ore/i.test(val)) craftingMaterial = 'Ore';
                else if (/tool/i.test(val)) craftingMaterial = 'Tool';
                else if (/component/i.test(val)) craftingMaterial = 'Component';
                else if (/food/i.test(val)) craftingMaterial = 'Food';
                else if (/ammo/i.test(val)) craftingMaterial = 'Ammo';
                // Estendi con altri materiali noti
                else if (/metal/i.test(val)) craftingMaterial = 'Metal';
                else if (/fiber/i.test(val)) craftingMaterial = 'Fiber';
                else if (/chemical/i.test(val)) craftingMaterial = 'Chemical';
                else if (/circuit/i.test(val)) craftingMaterial = 'Circuit';
              }
              if (craftingMaterial) break;
            }
            if (craftingMaterial) break;
          }
          if (craftingMaterial) break;
        }
      }
      // 3b. Fallback: deduci Fuel/Food dai log/instructions se non trovato
      if (isCrafting && !craftingMaterial) {
        const logsLower = (tx.logMessages || []).join(' ').toLowerCase();
        const instrLower = (tx.instructions || []).join(' ').toLowerCase();
        const combinedLower = `${logsLower} ${instrLower}`;
        if (combinedLower.includes('fuel')) craftingMaterial = 'Fuel';
        else if (combinedLower.includes('food')) craftingMaterial = 'Food';
      }
      // 4. If still crafting, try to fetch on-chain recipe account(s) owned by the Crafting program
      let decodedRecipe: any = null;
      let craftingAction: string = 'crafting_start'; // default
      if (isCrafting && tx.accountKeys && Array.isArray(tx.accountKeys)) {
        // Determine start/claim using token balance deltas first
        try {
          const preBalances = tx.meta?.preTokenBalances || [];
          const postBalances = tx.meta?.postTokenBalances || [];
          const preMap: Record<string, any> = {};
          for (const p of preBalances) {
            if (!p) continue;
            const key = `${p.owner || ''}:${p.mint || ''}`;
            preMap[key] = p;
          }
          let foundPos = false;
          let foundNeg = false;
          for (const p of postBalances) {
            if (!p || !p.mint) continue;
            const key = `${p.owner || ''}:${p.mint}`;
            const pre = preMap[key];
            const preAmt = pre?.uiTokenAmount?.amount ? BigInt(pre.uiTokenAmount.amount) : 0n;
            const postAmt = p.uiTokenAmount?.amount ? BigInt(p.uiTokenAmount.amount) : 0n;
            const delta = postAmt - preAmt;
            if (delta > 0n) foundPos = true;
            if (delta < 0n) foundNeg = true;
          }
          if (foundPos && !foundNeg) craftingAction = 'crafting_claim';
          else if (foundNeg && !foundPos) craftingAction = 'crafting_start';
          else if (foundPos) craftingAction = 'crafting_claim';
        } catch (e) {
          // fallback to logs
        }
        // Fallback to logs if deltas inconclusive
        if (craftingAction === 'crafting_start') {
          const logsStr = (tx.meta?.logMessages || []).join(' ').toLowerCase();
          if (logsStr.includes('claim') || logsStr.includes('complete') || logsStr.includes('withdraw')) {
            craftingAction = 'crafting_claim';
          }
        }
        // Fallback to inner instructions token transfers: any positive MATERIAL transfer implies claim
        if (craftingAction === 'crafting_start') {
          try {
            const inners = tx.meta?.innerInstructions || [];
            let posFound = false;
            for (const inner of inners || []) {
              for (const inst of inner.instructions || []) {
                const parsed = (inst as any).parsed?.info || (inst as any).info || (inst as any).parsed;
                if (!parsed) continue;
                const amount = parsed.amount || parsed.tokenAmount?.amount || parsed.uiTokenAmount?.amount;
                const mint = parsed.mint || parsed.mintAddress || parsed.tokenMint;
                if (!amount || !mint) continue;
                const a = BigInt(String(amount));
                if (a > 0n && MATERIALS[mint]) { posFound = true; break; }
              }
              if (posFound) break;
            }
            if (posFound) craftingAction = 'crafting_claim';
          } catch (e) { }
        }

        try {
          const candidates = tx.accountKeys.filter((k: string) => k && !excludeAccounts.includes(k) && k.length > 40).slice(0, 6);
          if (candidates.length > 0) {
            // Use shared pool connection instead of creating new one

            // Fetch account info with pool
            for (let ci = 0; ci < candidates.length && !decodedRecipe; ci++) {
              try {
                const accInfo = await sharedPoolConnection.getAccountInfo(new PublicKey(candidates[ci]), {
                  timeoutMs: 5000,
                  maxRetries: 0,
                  logErrors: false,
                });
                if (!accInfo || !accInfo.data) continue;
                if (accInfo.owner && accInfo.owner.toBase58() !== CRAFT_PROGRAM_ID) continue;

                // Try Rust decoder
                try {
                  const rr = decodeAccountWithRust(accInfo.data);
                  if (rr) {
                    if (rr.recipe || rr.Recipe) { decodedRecipe = { kind: 'recipe', data: rr.recipe || rr.Recipe }; break; }
                    if (rr.process || rr.Process) { decodedRecipe = { kind: 'process', data: rr.process || rr.Process }; break; }
                    if (rr.item || rr.Item) { decodedRecipe = { kind: 'item', data: rr.item || rr.Item }; break; }
                    if (rr.data && (rr.data.Recipe || rr.data.Process || rr.data.Item)) {
                      const inner = rr.data;
                      if (inner.Recipe) { decodedRecipe = { kind: 'recipe', data: inner.Recipe }; break; }
                      if (inner.Process) { decodedRecipe = { kind: 'process', data: inner.Process }; break; }
                      if (inner.Item) { decodedRecipe = { kind: 'item', data: inner.Item }; break; }
                    }
                  }
                } catch (e) {
                  // ignore rust wrapper failures
                }

                // Try JS decoders
                if (!decodedRecipe) {
                  const dr = decodeRecipe(accInfo.data);
                  if (dr) { decodedRecipe = { kind: 'recipe', data: dr }; break; }
                }
                if (!decodedRecipe) {
                  const dp = decodeCraftingProcess(accInfo.data);
                  if (dp) { decodedRecipe = { kind: 'process', data: dp }; break; }
                }
                if (!decodedRecipe) {
                  const di = decodeCraftableItem(accInfo.data);
                  if (di) { decodedRecipe = { kind: 'item', data: di }; break; }
                }
              } catch (err) {
                // tolerate individual fetch errors
              }
            }
          }

          if (decodedRecipe) {
            if (decodedRecipe.kind === 'recipe') {
              const mints = (decodedRecipe.data.recipe_items || []).map((ri: any) => ri.mint).filter(Boolean);
              if (mints && mints.length > 0) {
                try {
                  const md = await resolveMints(mints);
                  const display = mints.map((mm: string) => {
                    const info = md[mm];
                    if (info && info.name) return info.name + (info.symbol ? ` (${info.symbol})` : '');
                    return mm;
                  }).join(', ');
                  craftingMaterial = display;
                } catch (e) {
                  craftingMaterial = mints.join(', ');
                }
              }
              craftingType = craftingType || `Recipe:${decodedRecipe.data.category?.slice(0, 8) || decodedRecipe.data.version}`;
            } else if (decodedRecipe.kind === 'process') {
              craftingType = craftingType || `Process:${decodedRecipe.data.crafting_id}`;
              // recipe pubkey may hint the recipe
              craftingMaterial = craftingMaterial || decodedRecipe.data.recipe;
            } else if (decodedRecipe.kind === 'item') {
              craftingType = craftingType || `OutputItem`;
              if (decodedRecipe.data.mint) {
                try {
                  const md = await resolveMints([decodedRecipe.data.mint]);
                  const info = md[decodedRecipe.data.mint];
                  craftingMaterial = info && info.name ? (info.name + (info.symbol ? ` (${info.symbol})` : '')) : decodedRecipe.data.mint;
                } catch (e) {
                  craftingMaterial = decodedRecipe.data.mint;
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
      if (operation === 'Unknown') {
        unknownOperations++;
      }

      // No grouping - use raw operation names as requested
      let groupedOperation = operation;

      // Aggregazione per fleet - cerca fleet account o cargo hold
      let involvedFleetName = undefined;
      let involvedFleetKey: string | undefined = undefined;

      // First try: use the accountToFleet map for all account keys in the transaction
      if (tx.accountKeys) {
        for (const acc of tx.accountKeys) {
          const matchedFleetKey = accountToFleet.get(acc);
          if (matchedFleetKey) {
            involvedFleetKey = matchedFleetKey;
            involvedFleetName = fleetAccountNames[matchedFleetKey] || matchedFleetKey.substring(0, 8);
            break;
          }
        }
      }

      // Second try: categorize non-fleet operations (crafting, starbase, system ops)
      if (!involvedFleetName) {
        if (isCrafting || groupedOperation === 'Crafting' || operation.includes('Craft')) {
          involvedFleetName = 'Crafting Operations';
        } else if (operation.includes('Starbase')) {
          involvedFleetName = 'Starbase Operations';
        } else if (operation.includes('Cargo')) {
          involvedFleetName = 'Cargo Management';
        } else if (operation.includes('Survey') || operation.includes('Scan')) {
          involvedFleetName = 'Survey & Discovery';
        } else if (operation.includes('Register') || operation.includes('Deregister') || operation.includes('Update') || operation.includes('Init')) {
          involvedFleetName = 'Configuration';
        } else if (operation.includes('Profile') || operation.includes('Progression') || operation.includes('Points')) {
          involvedFleetName = 'Player Profile';
        } else if (operation.includes('Rental')) {
          involvedFleetName = 'Fleet Rentals';
        } else if (operation.includes('Sector') || operation.includes('Planet') || operation.includes('Star')) {
          involvedFleetName = 'Universe Management';
        } else {
          // Default for any other SAGE operation
          involvedFleetName = 'Other Operations';
        }
      }

      // Raggruppa tutte le crafting sotto 'Crafting' per feesByFleet/feesByOperation
      operation = groupedOperation;
      if (isCrafting && groupedOperation === 'Unknown') operation = 'Crafting';
      
      const fleetKey = involvedFleetKey || resolveFleetKey(involvedFleetName);
      if (fleetKey) {
        if (!feesByFleet[fleetKey]) {
          feesByFleet[fleetKey] = {
            totalFee: 0,
            feePercentage: 0,
            totalOperations: 0,
            operations: {},
            isRented: fleetRentalStatus[fleetKey] || false
          };
        }

        feesByFleet[fleetKey].totalFee += tx.fee;
      }

      // --- Compute composite operation once per tx ---
      const refineOp = (op: string): string => {
        if (op === 'FleetStateHandler' && tx.logMessages) {
          const logsJoined = tx.logMessages.join(' ');
          const logsLower = logsJoined.toLowerCase();
          if (logsLower.includes('movesubwarp') || logsLower.includes('stopsubwarp') || logsLower.includes('subwarp')) return 'FleetStateHandler_subwarp';
          if (logsLower.includes('mineasteroid') || logsLower.includes('stopmining') || logsLower.includes('mining')) return 'FleetStateHandler_mining';
          if (logsLower.includes('loadingbaytoidle') || logsLower.includes('idletoloadingbay')) return 'FleetStateHandler_loading_bay';
        }
        return op;
      };

      const opsToAggregate = (tx.instructions && tx.instructions.length > 0) ? tx.instructions : [operation];
      const refinedOps = opsToAggregate.map(refineOp).filter(Boolean);
      const compositeOperation = refinedOps.length > 0 ? Array.from(new Set(refinedOps)).join('') : refineOp(operation);
      const opKey = compositeOperation || refineOp(operation);

      // Update feesByFleet with composite operation
      if (fleetKey) {
        if (!feesByFleet[fleetKey].operations[opKey]) {
          feesByFleet[fleetKey].operations[opKey] = {
            count: 0,
            totalFee: 0,
            avgFee: 0,
            percentageOfFleet: 0,
            details: []
          };
        }
        feesByFleet[fleetKey].operations[opKey].count++;
        feesByFleet[fleetKey].operations[opKey].totalFee += tx.fee;

        if (isCrafting && (opKey === operation || opKey.toLowerCase().includes('craft'))) {
          feesByFleet[fleetKey].operations[opKey].details.push({
            action: craftingAction,
            type: craftingAction,
            displayType: craftingType || 'Crafting',
            fee: tx.fee,
            material: craftingMaterial,
            txid: tx.signature,
            fleet: fleetKey,
            decodedKind: decodedRecipe ? decodedRecipe.kind : undefined,
            decodedData: decodedRecipe ? decodedRecipe.data : undefined
          });
        }
      }

      // --- AGGIORNA feesByOperation con same composite operation ---
      if (!feesByOperation[opKey]) {
        feesByOperation[opKey] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
      }
      feesByOperation[opKey].count++;
      feesByOperation[opKey].totalFee += tx.fee;

      if (isCrafting && (opKey === operation || opKey.toLowerCase().includes('craft'))) {
        feesByOperation[opKey].details.push({
          action: craftingAction,
          type: craftingAction,
          displayType: craftingType || 'Crafting',
          fee: tx.fee,
          material: craftingMaterial,
          txid: tx.signature,
          fleet: involvedFleetName,
          decodedKind: decodedRecipe ? decodedRecipe.kind : undefined,
          decodedData: decodedRecipe ? decodedRecipe.data : undefined
        });
      }
    }

    // Dopo aver processato il batch, aggiorna il totale operazioni per ogni flotta
    Object.values(feesByFleet).forEach(fleetData => {
      const ops = Object.values((fleetData as any).operations) as any[];
      (fleetData as any).totalOperations = ops.reduce((sum, op) => sum + (op.count || 0), 0);
    });

    // Aggiornamento percentuali
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

    // Log sintetici per crafting details phase
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const processedInBatch = Math.min(BATCH_SIZE, allTransactions.length - i);
    const totalProcessedSoFar = Math.min(i + BATCH_SIZE, allTransactions.length);
    const remainingTxs = allTransactions.length - totalProcessedSoFar;
    const batchTimeElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
    const txPerSec = processedInBatch > 0 ? (processedInBatch / (Number(batchTimeElapsed) || 1)).toFixed(1) : '0.0';
    const sageOpCount = processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID)).length;
    const craftingOpCount = Object.keys(feesByOperation).includes('Crafting') ? feesByOperation['Crafting'].count : 0;

    nlog(`[crafting-details] Batch ${batchNum}: processed ${processedInBatch} tx in ${batchTimeElapsed}s (${txPerSec} tx/s), remaining: ${remainingTxs}, SAGE ops: ${sageOpCount}, Crafting ops: ${craftingOpCount}`);

    // Build partial result per batch
    const partialResult = {
      type: 'progress',
      stage: 'transactions',
      message: `Processing batch ${batchNum} (${txPerSec} tx/s, delay: ${currentDelay}ms)`,
      processed: totalProcessedSoFar,
      total: totalSigs,
      percentage: ((totalProcessedSoFar / totalSigs) * 100).toFixed(1),
      batchTime: batchTimeElapsed,
      currentDelay,
      walletAddress: walletPubkey,
      period: `Last ${hours} hours`,
      totalFees24h,
      sageFees24h,
      transactionCount24h: sageOpCount,
      totalSignaturesFetched: totalSigs,
      feesByFleet: filterFleetBuckets({ ...feesByFleet }),
      feesByOperation: { ...feesByOperation },
      unknownOperations,
      rentedFleetAccounts: Object.keys(fleetRentalStatus).filter(k => fleetRentalStatus[k]),
      fleetAccountNamesEcho: fleetAccountNames,
      fleetRentalStatusFinal: fleetRentalStatus
    };
    // DEBUG: Log feesByFleet before sending update
    // console.log('DEBUG: feesByFleet before sendUpdate:', JSON.stringify(feesByFleet, null, 2));
    sendUpdate(partialResult);
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

  // Pair crafting Start+Complete transactions (within 30s window)
  const craftingPairs: Map<string, { start: any; complete: any | null }> = new Map();
  for (const tx of processedTransactions) {
    const hasCreate = tx.instructions?.includes('CreateCraftingProcess');
    const hasClose = tx.instructions?.includes('CloseCraftingProcess');
    const hasBurn = tx.instructions?.includes('BurnConsumableIngredient') || tx.instructions?.includes('BurnCraftingConsumables');
    const hasClaim = tx.instructions?.includes('ClaimRecipeOutput') || tx.instructions?.includes('ClaimCraftingOutputs');

    const fleetName = (tx as any).involvedFleetName || ((tx as any).involvedFleets && (tx as any).involvedFleets[0]) || 'unknown';

    if (hasCreate) {
      const key = `craft_${tx.blockTime || 0}_${fleetName}`;
      craftingPairs.set(key, { start: tx, complete: null });
    } else if (hasClose && (hasBurn || hasClaim)) {
      // Find matching start within 30s
      for (const [k, pair] of Array.from(craftingPairs.entries()).reverse()) {
        const pairFleetName = (pair.start as any).involvedFleetName || ((pair.start as any).involvedFleets && (pair.start as any).involvedFleets[0]) || 'unknown';
        if (!pair.complete && pair.start && pairFleetName === fleetName) {
          const timeDelta = Math.abs((tx.blockTime || 0) - (pair.start.blockTime || 0));
          if (timeDelta < 30) {
            pair.complete = tx;
            break;
          }
        }
      }
    }
  }

  // Merge paired crafting transactions
  const pairedSignatures = new Set<string>();
  const mergedTransactions: any[] = [];
  for (const [key, pair] of craftingPairs.entries()) {
    if (pair.start && pair.complete) {
      pairedSignatures.add(pair.start.signature);
      pairedSignatures.add(pair.complete.signature);
      mergedTransactions.push({
        ...pair.start,
        signature: `${pair.start.signature}+${pair.complete.signature}`,
        fee: pair.start.fee + pair.complete.fee,
        instructions: [...(pair.start.instructions || []), ...(pair.complete.instructions || [])],
        pairedTxs: [pair.start.signature, pair.complete.signature],
        isPaired: true
      });
    } else if (pair.start) {
      mergedTransactions.push(pair.start);
    }
  }
  for (const tx of processedTransactions) {
    if (!pairedSignatures.has(tx.signature)) {
      mergedTransactions.push(tx);
    }
  }
  processedTransactions = mergedTransactions;

  // Aggregazione e ordinamento finale
  processedTransactions.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
  const sageTransactions = processedTransactions.filter(t => t.programIds.includes(SAGE_PROGRAM_ID));
  const finalResult = {
    type: 'complete',
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h,
    sageFees24h,
    transactionCount24h: sageTransactions.length,
    totalSignaturesFetched: totalSigs,
    feesByFleet: filterFleetBuckets(feesByFleet),
    feesByOperation,
    transactions: processedTransactions,
    unknownOperations: sageTransactions.filter(t => (t as any).operation === 'Unknown').length,
    rentedFleetAccounts: Object.keys(fleetRentalStatus).filter(k => fleetRentalStatus[k]),
    fleetAccountNamesEcho: fleetAccountNames,
    fleetRentalStatusFinal: fleetRentalStatus
  };
  //console.log('Final feesByFleet:', JSON.stringify(feesByFleet, null, 2));
  sendUpdate(finalResult);
  return finalResult;
}
