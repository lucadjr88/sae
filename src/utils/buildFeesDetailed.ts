import fs from 'fs/promises';
import path from 'path';
import { setCache } from './cache';

function getCacheDir(profileId: string, namespace: string) {
  return path.join(process.cwd(), 'cache', profileId, namespace);
}

async function readJson(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractFee(op: any): number {
  if (!op) return 0;
  if (typeof op.txInfo?.fee === 'number') return op.txInfo.fee;
  if (typeof op.txInfo?.meta?.fee === 'number') return op.txInfo.meta.fee;
  if (typeof op.fee === 'number') return op.fee;
  return 0;
}

function extractOperationName(op: any): string {
  // Se l'operazione è SAGE_OP, guarda dentro decoded per il nome reale
  if (op.instructionName === 'SAGE_OP' && Array.isArray(op.decoded) && op.decoded.length > 0) {
    // Prendi il primo decoded con success === true e name presente
    const decoded = op.decoded.find((d: any) => d && d.success === true && d.name);
    if (decoded && decoded.name) {
      return decoded.name;
    }
  }
  // Altrimenti usa instructionName o instruction o 'Unknown'
  return (op.instructionName || op.instruction || 'Unknown').toString();
}

function identifyCraftingPhase(op: any): 'Start' | 'Complete' | null {
  // Analizza le operazioni decoded per identificare la fase di crafting
  if (!Array.isArray(op.decoded) || op.decoded.length === 0) return null;
  
  const opNames = op.decoded.filter((d: any) => d && d.name).map((d: any) => d.name);
  
  // Start phase: CreateStarbaseUpgradeResourceProcess, DepositCraftingIngredient, StartCraftingProcess
  // OR CreateCraftingProcess (per crafting standard)
  const hasCreate = opNames.some((n: string) => /(CreateCraftingProcess|CreateStarbaseUpgradeResourceProcess)/i.test(n));
  const hasDeposit = opNames.some((n: string) => /DepositCraftingIngredient/i.test(n));
  const hasStart = opNames.some((n: string) => /StartCraftingProcess/i.test(n));
  
  // Complete phase: BurnCraftingConsumables, ClaimCraftingOutputs, CloseCraftingProcess
  const hasBurn = opNames.some((n: string) => /BurnCraftingConsumables/i.test(n));
  const hasClaim = opNames.some((n: string) => /ClaimCraftingOutputs/i.test(n));
  const hasClose = opNames.some((n: string) => /CloseCraftingProcess/i.test(n));
  
  if (hasCreate || hasDeposit || hasStart) return 'Start';
  if (hasBurn || hasClaim || hasClose) return 'Complete';
  
  return null;
}

function extractTokenDeltas(op: any): any {
  const preTokenBalances = op.txInfo?.preTokenBalances || [];
  const postTokenBalances = op.txInfo?.postTokenBalances || [];
  //console.log(`[extractTokenDeltas] sig=${op.signature?.substring(0,8)} pre=${preTokenBalances.length} post=${postTokenBalances.length}`);
  const burned: any[] = [];
  const claimed: any[] = [];
  const preMap: Record<number, any> = {};
  preTokenBalances.forEach((p: any) => { preMap[p.accountIndex] = p; });
  const postMap: Record<number, any> = {};
  postTokenBalances.forEach((p: any) => { postMap[p.accountIndex] = p; });
  const allIndexes = new Set([...Object.keys(preMap).map(k => parseInt(k)), ...Object.keys(postMap).map(k => parseInt(k))]);
  allIndexes.forEach((idx: number) => {
    const pre = preMap[idx];
    const post = postMap[idx];
    if (pre && !post) {
      burned.push({ mint: pre.mint, amount: pre.uiTokenAmount.uiAmount, decimals: pre.uiTokenAmount.decimals });
    } else if (pre && post) {
      const delta = parseFloat(post.uiTokenAmount.amount) - parseFloat(pre.uiTokenAmount.amount);
      if (delta > 0) {
        claimed.push({ mint: post.mint, amount: delta / Math.pow(10, post.uiTokenAmount.decimals), decimals: post.uiTokenAmount.decimals });
      } else if (delta < 0) {
        burned.push({ mint: pre.mint, amount: Math.abs(delta) / Math.pow(10, pre.uiTokenAmount.decimals), decimals: pre.uiTokenAmount.decimals });
      }
    }
  });
  return { burned, claimed };
}

export async function buildFeesDetailed(profileId: string) {
  //console.log(`[buildFeesDetailed] START profileId=${profileId}`);
  const breakdownDir = getCacheDir(profileId, 'fleet-breakdowns');
  const playerOpsDir = getCacheDir(profileId, 'player-ops');
  const unknownDir = getCacheDir(profileId, 'unknown');
  const fleetsDir = getCacheDir(profileId, 'fleets');

  const feesByFleet: Record<string, any> = {};
  const feesByOperation: Record<string, { count: number; totalFee: number; details?: any[] }> = {};

  // load fleets to detect isRented by checking rented-fleets folder presence
  const fleetFiles = await fs.readdir(fleetsDir).catch(() => []);
  const fleetSet = new Set(fleetFiles.map(f => f.replace(/\.json$/, '')));

  // process fleet-breakdowns
  const breakdownFiles = await fs.readdir(breakdownDir).catch(() => []);
  //console.log(`[buildFeesDetailed] Found ${breakdownFiles.length} breakdown files`);
  let totalSigs = 0;
  let firstTxTime: number | null = null;
  for (const bf of breakdownFiles) {
    const bpath = path.join(breakdownDir, bf);
    const raw = await readJson(bpath);
    if (!raw) continue;
    const payload = raw.data ?? raw;
    const fleet = payload.fleet;
    const ops = payload.ops || [];
    const fleetPk = fleet?.pubkey || bf.replace(/\.json$/, '');

    const fleetEntry: any = { totalFee: 0, totalOperations: 0, operations: {}, isRented: false };
    if (fleetSet.has(fleetPk)) {
      // check rented status by existence in rented-fleets
      const rentedPath = path.join(process.cwd(), 'cache', profileId, 'rented-fleets', `${fleetPk}.json`);
      const rentedExists = (await fs.stat(rentedPath).then(() => true).catch(() => false));
      fleetEntry.isRented = rentedExists;
    }

    for (const op of ops) {
      totalSigs += 1;
      const blockTime = op.blockTime || op.txInfo?.blockTime;
      if (blockTime && (!firstTxTime || blockTime < firstTxTime)) {
        firstTxTime = blockTime;
      }
      const fee = extractFee(op);
      fleetEntry.totalFee += fee;
      fleetEntry.totalOperations += 1;
      let opName = extractOperationName(op);
      
      // Check if this is a crafting operation by looking at decoded operations
      const craftingPhase = identifyCraftingPhase(op);
      if (craftingPhase) {
        opName = 'Crafting';
        //console.log(`[buildFeesDetailed] Fleet crafting detected: ${craftingPhase} for sig=${op.signature?.substring(0,8)}`);
      }
      
      if (!fleetEntry.operations[opName]) fleetEntry.operations[opName] = { count: 0, totalFee: 0, details: [] };
      fleetEntry.operations[opName].count += 1;
      fleetEntry.operations[opName].totalFee += fee;
      const detailEntry: any = { signature: op.signature, fee };
      if (craftingPhase) {
        const tokenDeltas = extractTokenDeltas(op);
        detailEntry.burned = tokenDeltas.burned;
        detailEntry.claimed = tokenDeltas.claimed;
        //console.log(`[buildFeesDetailed] MATCH craft: opName=${opName} sig=${op.signature?.substring(0,8)}`);
      }
      fleetEntry.operations[opName].details.push(detailEntry);

      // aggregate global by operation
      if (!feesByOperation[opName]) feesByOperation[opName] = { count: 0, totalFee: 0, details: [] };
      feesByOperation[opName].count += 1;
      feesByOperation[opName].totalFee += fee;
      const globalDetailEntry: any = { signature: op.signature, fee, fleet: fleetPk };
      if (craftingPhase) {
        const tokenDeltas = extractTokenDeltas(op);
        globalDetailEntry.burned = tokenDeltas.burned;
        globalDetailEntry.claimed = tokenDeltas.claimed;
        //console.log(`[buildFeesDetailed] Crafting op=${opName} sig=${op.signature?.substring(0,8)} burned=${tokenDeltas.burned.length} claimed=${tokenDeltas.claimed.length}`);
      }
      feesByOperation[opName].details.push(globalDetailEntry);
    }

    feesByFleet[fleetPk] = fleetEntry;
  }

  // process player-ops (unmatched) - these count in totals
  const playerOpsFiles = await fs.readdir(playerOpsDir).catch(() => []);
  for (const f of playerOpsFiles) {
    const p = path.join(playerOpsDir, f);
    const raw = await readJson(p);
    if (!raw) continue;
    const op = raw.data ?? raw;
    totalSigs += 1;
    const blockTime = op.blockTime || op.txInfo?.blockTime;
    if (blockTime && (!firstTxTime || blockTime < firstTxTime)) {
      firstTxTime = blockTime;
    }
    const fee = extractFee(op);
    let opName = extractOperationName(op);
    
    // Check if this is a crafting operation by looking at decoded operations
    const craftingPhase = identifyCraftingPhase(op);
    if (craftingPhase) {
      opName = 'Crafting';
      //console.log(`[buildFeesDetailed] Player-ops crafting detected: ${craftingPhase} for sig=${op.signature?.substring(0,8)}`);
    }
    
    if (!feesByOperation[opName]) feesByOperation[opName] = { count: 0, totalFee: 0, details: [] };
    feesByOperation[opName].count += 1;
    feesByOperation[opName].totalFee += fee;
    const playerDetailEntry: any = { signature: op.signature, fee, fleet: null };
    
    if (craftingPhase) {
      const tokenDeltas = extractTokenDeltas(op);
      playerDetailEntry.burned = tokenDeltas.burned;
      playerDetailEntry.claimed = tokenDeltas.claimed;
      //console.log(`[buildFeesDetailed] MATCH craft in player-ops: opName=${opName} sig=${op.signature?.substring(0,8)}`);
    }
    feesByOperation[opName].details.push(playerDetailEntry);
  }

  // process unknown ops - visible only in All Other Operations, NOT counted in totals
  let unknownOpsCount = 0;
  const unknownFiles = await fs.readdir(unknownDir).catch(() => []);
  for (const f of unknownFiles) {
    const p = path.join(unknownDir, f);
    const raw = await readJson(p);
    if (!raw) continue;
    const op = raw.data ?? raw;
    unknownOpsCount += 1;
    const fee = extractFee(op);
    const opName = extractOperationName(op);
    if (!feesByOperation[opName]) feesByOperation[opName] = { count: 0, totalFee: 0, details: [] };
    feesByOperation[opName].count += 1;
    feesByOperation[opName].totalFee += fee;
    feesByOperation[opName].details.push({ signature: op.signature, fee, fleet: null });
  }

  // Calculate sageFees24h: sum only from feesByFleet (excludes unknown ops)
  const sageFees24h = Object.values(feesByFleet).reduce((s: number, f: any) => s + (f.totalFee || 0), 0);

  const payload = {
    feesByFleet,
    feesByOperation,
    sageFees24h,
    totalSignaturesFetched: totalSigs,
    transactionCount24h: totalSigs - unknownOpsCount,
    unknownOperations: unknownOpsCount,
    fromCache: true,
    firstTxTime: firstTxTime // timestamp in seconds
  };

  // persist payload in cache reports
  await setCache('reports', 'wallet-sage-fees-detailed', payload, profileId);

  return payload;
}

export default buildFeesDetailed;
