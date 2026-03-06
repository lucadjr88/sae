import fs from 'fs/promises';
import path from 'path';
import { getCache, setCache } from './cache';

const MATERIAL_REGISTRY: Record<string, MaterialInfo> = {
  foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG: {
    name: 'Food',
    symbol: 'FOOD',
    category: 'consumable',
    decimals: 0
  },
  HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp: {
    name: 'Hydrogen',
    symbol: 'HYDR',
    category: 'fuel',
    decimals: 0
  },
  ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK: {
    name: 'Ammo',
    symbol: 'AMMO',
    category: 'consumable',
    decimals: 0
  },
};

type MaterialInfo = {
  name: string;
  symbol: string;
  category: string;
  decimals: number;
};

type TokenDelta = {
  accountIndex: number;
  mint: string;
  owner: string;
  preAmount: number;
  postAmount: number;
  delta: number;
  decimals: number;
};

type TokenFlowType = 'CARGO_IN' | 'CARGO_OUT' | 'AMMO_IN' | 'AMMO_OUT' | 'FUEL_IN' | 'FUEL_OUT' | 'WALLET_TRANSFER' | 'UNKNOWN';

type TokenDeltaResult = {
  deltas: TokenDelta[];
  burned: Array<{ mint: string; amount: number; owner: string; decimals: number }>;
  minted: Array<{ mint: string; amount: number; owner: string; decimals: number }>;
};

type FleetInfo = {
  key: string;
  callsign: string;
  cargoKey?: string;
  cargoHold?: string;
  ammoKey?: string;
  ammoBank?: string;
  fuelKey?: string;
  fuelTank?: string;
};

type ResourceFlowClassified = TokenDelta & {
  flowType: TokenFlowType;
  fleetKey?: string;
  materialName?: string;
  materialSymbol?: string;
};

type MaterialFlowAggregate = {
  mint: string;
  name: string;
  symbol: string;
  category: string;
  totalIn: number;
  totalOut: number;
  net: number;
  operations: Record<string, { in: number; out: number; count: number }>;
  topFleets: Array<{ fleetKey: string; callsign: string; net: number }>;
};

type FleetMaterialFlow = {
  mint: string;
  name: string;
  in: number;
  out: number;
  net: number;
  operations: Record<string, { in: number; out: number; count: number }>;
};

type FleetResourceFlow = {
  key: string;
  callsign: string;
  isRented: boolean;
  totalMaterialsIn: number;
  totalMaterialsOut: number;
  totalMaterialsNet: number;
  materials: Record<string, FleetMaterialFlow>;
};

type OperationResourceFlow = {
  name: string;
  materialsProduced: Record<string, number>;
  materialsConsumed: Record<string, number>;
  operationCount: number;
  fleets: string[];
};

type ResourceFlowSummary = {
  profileId: string;
  timeWindow: string;
  generatedAt: number;
  summary: {
    totalMaterialsIn: number;
    totalMaterialsOut: number;
    netChange: number;
    materialsTracked: number;
    fleetsAnalyzed: number;
    operationsAnalyzed: number;
    transactionsProcessed: number;
  };
  byFleet: Record<string, FleetResourceFlow>;
  byMaterial: Record<string, MaterialFlowAggregate>;
  byOperation: Record<string, OperationResourceFlow>;
};

function extractTokenDeltas(op: any): TokenDeltaResult {
  const pre = (op.txInfo?.preTokenBalances as any[]) || [];
  const post = (op.txInfo?.postTokenBalances as any[]) || [];

  const preMap = new Map(pre.map((p: any) => [p.accountIndex, p]));
  const postMap = new Map(post.map((p: any) => [p.accountIndex, p]));

  const allIndexes = new Set([...preMap.keys(), ...postMap.keys()]);

  const deltas: TokenDelta[] = [];
  const burned: Array<{ mint: string; amount: number; owner: string; decimals: number }> = [];
  const minted: Array<{ mint: string; amount: number; owner: string; decimals: number }> = [];

  for (const idx of allIndexes) {
    const preBalance = preMap.get(idx);
    const postBalance = postMap.get(idx);

    if (preBalance && !postBalance) {
      burned.push({
        mint: preBalance.mint,
        amount: preBalance.uiTokenAmount.uiAmount,
        owner: preBalance.owner,
        decimals: preBalance.uiTokenAmount.decimals
      });
    } else if (!preBalance && postBalance) {
      minted.push({
        mint: postBalance.mint,
        amount: postBalance.uiTokenAmount.uiAmount,
        owner: postBalance.owner,
        decimals: postBalance.uiTokenAmount.decimals
      });
    } else if (preBalance && postBalance) {
      const preAmount = parseFloat(preBalance.uiTokenAmount.amount);
      const postAmount = parseFloat(postBalance.uiTokenAmount.amount);
      const delta = postAmount - preAmount;

      if (delta !== 0) {
        deltas.push({
          accountIndex: idx,
          mint: preBalance.mint,
          owner: preBalance.owner,
          preAmount,
          postAmount,
          delta: delta / Math.pow(10, preBalance.uiTokenAmount.decimals),
          decimals: preBalance.uiTokenAmount.decimals
        });
      }
    }
  }

  return { deltas, burned, minted };
}

function classifyTokenFlow(delta: TokenDelta, fleet: FleetInfo | null): TokenFlowType {
  if (!fleet) return 'WALLET_TRANSFER';

  if (delta.owner === fleet.cargoKey || delta.owner === fleet.cargoHold) {
    return delta.delta > 0 ? 'CARGO_IN' : 'CARGO_OUT';
  }
  if (delta.owner === fleet.ammoKey || delta.owner === fleet.ammoBank) {
    return delta.delta > 0 ? 'AMMO_IN' : 'AMMO_OUT';
  }
  if (delta.owner === fleet.fuelKey || delta.owner === fleet.fuelTank) {
    return delta.delta > 0 ? 'FUEL_IN' : 'FUEL_OUT';
  }

  return 'WALLET_TRANSFER';
}

function getMaterialInfo(mint: string): Partial<MaterialInfo> {
  if (MATERIAL_REGISTRY[mint]) {
    return MATERIAL_REGISTRY[mint];
  }
  return {
    name: `Token ${mint.substring(0, 8)}...`,
    symbol: mint.substring(0, 4).toUpperCase(),
    category: 'unknown'
  };
}

async function loadFleets(profileId: string): Promise<Map<string, FleetInfo>> {
  const fleetsDir = path.join(process.cwd(), 'cache', profileId, 'fleets');
  const fleetFiles = await fs.readdir(fleetsDir).catch(() => []);
  console.log(`[loadFleets] profileId=${profileId} found ${fleetFiles.length} fleet files`);

  const fleetsMap = new Map<string, FleetInfo>();

  for (const file of fleetFiles) {
    const filePath = path.join(fleetsDir, file);
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    try {
      const fleetData = JSON.parse(raw);
      const fleet = fleetData.data || fleetData;
      const key = fleetData.key || file.replace(/\.json$/, '');

      fleetsMap.set(key, {
        key,
        callsign: fleet.callsign || `Fleet-${key.substring(0, 8)}`,
        cargoKey: fleet.cargoHold,
        cargoHold: fleet.cargoHold,
        ammoKey: fleet.ammoBank,
        ammoBank: fleet.ammoBank,
        fuelKey: fleet.fuelTank,
        fuelTank: fleet.fuelTank
      });
    } catch (e) {
      console.log(`[loadFleets] skipped malformed file ${file}`);
    }
  }

  console.log(`[loadFleets] loaded ${fleetsMap.size} fleets`);
  return fleetsMap;
}

async function loadOperationsFromCache(profileId: string): Promise<any[]> {
  const breakdownDir = path.join(process.cwd(), 'cache', profileId, 'fleet-breakdowns');
  const playerOpsDir = path.join(process.cwd(), 'cache', profileId, 'player-ops');
  console.log(`[loadOperationsFromCache] profileId=${profileId}`);

  const allOps: any[] = [];

  // Load fleet breakdowns
  const breakdownFiles = await fs.readdir(breakdownDir).catch(() => []);
  console.log(`[loadOperationsFromCache] found ${breakdownFiles.length} breakdown files`);
  for (const file of breakdownFiles) {
    const filePath = path.join(breakdownDir, file);
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const payload = data.data || data;
      const ops = payload.ops || [];
      const fleetPk = payload.fleet?.pubkey || file.replace(/\.json$/, '');

      for (const op of ops) {
        allOps.push({
          ...op,
          _fleetKey: fleetPk,
          _fleetCallsign: payload.fleet?.callsign || `Fleet-${fleetPk.substring(0, 8)}`
        });
      }
    } catch {
      // skip malformed files
    }
  }

  // Load player ops
  const playerOpsFiles = await fs.readdir(playerOpsDir).catch(() => []);
  console.log(`[loadOperationsFromCache] found ${playerOpsFiles.length} player-ops files`);
  for (const file of playerOpsFiles) {
    const filePath = path.join(playerOpsDir, file);
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const op = data.data || data;
      allOps.push({
        ...op,
        _fleetKey: null,
        _fleetCallsign: 'Player Wallet'
      });
    } catch {
      // skip malformed files
    }
  }

  console.log(`[loadOperationsFromCache] total operations loaded: ${allOps.length}`);
  return allOps;
}

function extractOperationName(op: any): string {
  if (op.instructionName === 'SAGE_OP' && Array.isArray(op.decoded) && op.decoded.length > 0) {
    const decoded = op.decoded.find((d: any) => d && d.success === true && d.name);
    if (decoded?.name) {
      return decoded.name;
    }
  }

  if (Array.isArray(op.decoded) && op.decoded.length > 0) {
    const first = op.decoded[0];
    if (first?.name) return first.name;
    if (first?.enrichedName) return first.enrichedName;
  }

  return (op.instructionName || op.instruction || 'Unknown').toString();
}

async function decodeResources(profileId: string): Promise<ResourceFlowSummary> {
  console.log(`[decodeResources] START profileId=${profileId}`);
  const fleetsMap = await loadFleets(profileId);
  const operations = await loadOperationsFromCache(profileId);

  const byFleet = new Map<string, FleetResourceFlow>();
  const byMaterial = new Map<string, MaterialFlowAggregate>();
  const byOperation = new Map<string, OperationResourceFlow>();

  let totalMaterialsIn = 0;
  let totalMaterialsOut = 0;
  let transactionsProcessed = 0;
  console.log(`[decodeResources] initialized with ${fleetsMap.size} fleets and ${operations.length} operations`);

  // Initialize fleets
  for (const [key, fleet] of fleetsMap) {
    byFleet.set(key, {
      key,
      callsign: fleet.callsign,
      isRented: false,
      totalMaterialsIn: 0,
      totalMaterialsOut: 0,
      totalMaterialsNet: 0,
      materials: {}
    });
  }

  // Process operations
  for (const op of operations) {
    if (!op.txInfo || !op.success) continue;

    transactionsProcessed += 1;

    const deltas = extractTokenDeltas(op);
    const operationName = extractOperationName(op);
    const fleetKey = op._fleetKey;
    const fleet = fleetKey ? fleetsMap.get(fleetKey) : null;

    // Initialize operation if not exists
    if (!byOperation.has(operationName)) {
      byOperation.set(operationName, {
        name: operationName,
        materialsProduced: {},
        materialsConsumed: {},
        operationCount: 0,
        fleets: []
      });
    }
    const opRecord = byOperation.get(operationName)!;
    opRecord.operationCount += 1;
    if (fleetKey && !opRecord.fleets.includes(fleetKey)) {
      opRecord.fleets.push(fleetKey);
    }

    // Process deltas
    for (const delta of deltas.deltas) {
      const flowType = classifyTokenFlow(delta, fleet);
      const materialInfo = getMaterialInfo(delta.mint);

      // Initialize material if not exists
      if (!byMaterial.has(delta.mint)) {
        byMaterial.set(delta.mint, {
          mint: delta.mint,
          name: materialInfo.name || 'Unknown',
          symbol: materialInfo.symbol || 'UNK',
          category: materialInfo.category || 'unknown',
          totalIn: 0,
          totalOut: 0,
          net: 0,
          operations: {},
          topFleets: []
        });
      }
      const matRecord = byMaterial.get(delta.mint)!;

      // Aggregate by flow direction
      const isInflow = delta.delta > 0;
      const amount = Math.abs(delta.delta);

      if (isInflow) {
        matRecord.totalIn += amount;
        totalMaterialsIn += amount;
        opRecord.materialsProduced[delta.mint] = (opRecord.materialsProduced[delta.mint] || 0) + amount;
      } else {
        matRecord.totalOut += amount;
        totalMaterialsOut += amount;
        opRecord.materialsConsumed[delta.mint] = (opRecord.materialsConsumed[delta.mint] || 0) + amount;
      }

      matRecord.net = matRecord.totalIn - matRecord.totalOut;

      // Track by operation
      if (!matRecord.operations[operationName]) {
        matRecord.operations[operationName] = { in: 0, out: 0, count: 0 };
      }
      if (isInflow) {
        matRecord.operations[operationName].in += amount;
      } else {
        matRecord.operations[operationName].out += amount;
      }
      matRecord.operations[operationName].count += 1;

      // Track by fleet (if associated)
      if (fleetKey && byFleet.has(fleetKey)) {
        const fleetRecord = byFleet.get(fleetKey)!;

        if (!fleetRecord.materials[delta.mint]) {
          fleetRecord.materials[delta.mint] = {
            mint: delta.mint,
            name: materialInfo.name || 'Unknown',
            in: 0,
            out: 0,
            net: 0,
            operations: {}
          };
        }

        const fleetMatRecord = fleetRecord.materials[delta.mint];
        if (isInflow) {
          fleetMatRecord.in += amount;
          fleetRecord.totalMaterialsIn += amount;
        } else {
          fleetMatRecord.out += amount;
          fleetRecord.totalMaterialsOut += amount;
        }
        fleetMatRecord.net = fleetMatRecord.in - fleetMatRecord.out;

        if (!fleetMatRecord.operations[operationName]) {
          fleetMatRecord.operations[operationName] = { in: 0, out: 0, count: 0 };
        }
        if (isInflow) {
          fleetMatRecord.operations[operationName].in += amount;
        } else {
          fleetMatRecord.operations[operationName].out += amount;
        }
        fleetMatRecord.operations[operationName].count += 1;
      }
    }
  }

  // Calculate topFleets for each material
  for (const [mint, matRecord] of byMaterial) {
    const fleetMap = new Map<string, number>();
    for (const [fKey, fRecord] of byFleet) {
      if (fRecord.materials[mint]) {
        fleetMap.set(fKey, fRecord.materials[mint].net);
      }
    }
    const sorted = Array.from(fleetMap.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .map(([fKey, net]) => {
        const fRecord = byFleet.get(fKey)!;
        return { fleetKey: fKey, callsign: fRecord.callsign, net };
      });
    matRecord.topFleets = sorted;
  }

  // Finalize fleet totals
  for (const [, fRecord] of byFleet) {
    fRecord.totalMaterialsNet = fRecord.totalMaterialsIn - fRecord.totalMaterialsOut;
  }

  const summary: ResourceFlowSummary = {
    profileId,
    timeWindow: '24h',
    generatedAt: Date.now(),
    summary: {
      totalMaterialsIn: Math.round(totalMaterialsIn * 100) / 100,
      totalMaterialsOut: Math.round(totalMaterialsOut * 100) / 100,
      netChange: Math.round((totalMaterialsIn - totalMaterialsOut) * 100) / 100,
      materialsTracked: byMaterial.size,
      fleetsAnalyzed: byFleet.size,
      operationsAnalyzed: byOperation.size,
      transactionsProcessed
    },
    byFleet: Object.fromEntries(byFleet),
    byMaterial: Object.fromEntries(byMaterial),
    byOperation: Object.fromEntries(byOperation)
  };

  // Persist to cache in resources folder
  await setCache('resources', 'flows', summary, profileId);
  console.log(`[decodeResources] DONE profileId=${profileId} materials=${byMaterial.size} fleets=${byFleet.size} ops=${byOperation.size} txs=${transactionsProcessed}`);

  return summary;
}

export { decodeResources, ResourceFlowSummary };
