import fs from 'fs/promises';
import path from 'path';
import { getCache, setCache } from './cache.js';

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
  fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim: {
    name: 'Fuel',
    symbol: 'FUEL',
    category: 'fuel',
    decimals: 0
  },
  SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM: {
    name: 'Survey Data Unit',
    symbol: 'SDU',
    category: 'resource',
    decimals: 0
  },
};

const MATERIAL_PREFIX_REGISTRY: Array<{ prefix: string; info: MaterialInfo }> = [
  {
    prefix: 'food',
    info: { name: 'Food', symbol: 'FOOD', category: 'consumable', decimals: 0 }
  },
  {
    prefix: 'ammo',
    info: { name: 'Ammo', symbol: 'AMMO', category: 'consumable', decimals: 0 }
  },
  {
    prefix: 'fuel',
    info: { name: 'Fuel', symbol: 'FUEL', category: 'fuel', decimals: 0 }
  },
  {
    prefix: 'hydr',
    info: { name: 'Hydrogen', symbol: 'HYDR', category: 'fuel', decimals: 0 }
  },
  {
    prefix: 'sdu',
    info: { name: 'Survey Data Unit', symbol: 'SDU', category: 'resource', decimals: 0 }
  },
  {
    prefix: 'atlas',
    info: { name: 'Atlas', symbol: 'ATLAS', category: 'token', decimals: 0 }
  },
  {
    prefix: 'polis',
    info: { name: 'Polis', symbol: 'POLIS', category: 'token', decimals: 0 }
  }
];

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
  isRented: boolean;
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

function toUiAmount(amountRaw: unknown, decimalsRaw: unknown): number {
  const amount = Number(amountRaw);
  const decimals = Number(decimalsRaw);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  if (!Number.isFinite(decimals) || decimals <= 0) {
    return amount;
  }

  return amount / Math.pow(10, decimals);
}

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
        amount: toUiAmount(preBalance.uiTokenAmount?.amount, preBalance.uiTokenAmount?.decimals),
        owner: preBalance.owner || '',
        decimals: preBalance.uiTokenAmount.decimals
      });
    } else if (!preBalance && postBalance) {
      minted.push({
        mint: postBalance.mint,
        amount: toUiAmount(postBalance.uiTokenAmount?.amount, postBalance.uiTokenAmount?.decimals),
        owner: postBalance.owner || '',
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

  const mintLower = mint.toLowerCase();
  const byPrefix = MATERIAL_PREFIX_REGISTRY.find((entry) => mintLower.startsWith(entry.prefix));
  if (byPrefix) {
    return byPrefix.info;
  }

  return {
    name: `Token ${mint.substring(0, 8)}...`,
    symbol: mint.substring(0, 4).toUpperCase(),
    category: 'unknown'
  };
}

async function loadFleets(profileId: string): Promise<Map<string, FleetInfo>> {
  const fleetsMap = new Map<string, FleetInfo>();

  const collectFleetInfo = (fleetEntry: any, fallbackKey: string, isRented: boolean): FleetInfo | null => {
    const fleetContainer = fleetEntry?.data || fleetEntry;
    const fleet = fleetContainer?.data || fleetContainer?.fleetData || fleetContainer;
    const key =
      fleetEntry?.key ||
      fleetContainer?.key ||
      fleet?.pubkey ||
      fleetContainer?.fleet ||
      fallbackKey;

    if (!key) {
      return null;
    }

    const callsign =
      fleetContainer?.callsign ||
      fleet?.callsign ||
      fleet?.fleet_label ||
      fleet?.label ||
      `Fleet-${String(key).substring(0, 8)}`;

    const cargoHold = fleet?.cargoHold || fleet?.cargo_hold;
    const ammoBank = fleet?.ammoBank || fleet?.ammo_bank;
    const fuelTank = fleet?.fuelTank || fleet?.fuel_tank;

    return {
      key,
      callsign,
      isRented,
      cargoKey: cargoHold,
      cargoHold,
      ammoKey: ammoBank,
      ammoBank,
      fuelKey: fuelTank,
      fuelTank
    };
  };

  const loadFleetNamespace = async (namespace: string, isRented: boolean): Promise<void> => {
    const dir = path.join(process.cwd(), 'cache', profileId, namespace);
    const fleetFiles = await fs.readdir(dir).catch(() => []);
    let loadedFromNamespace = 0;
    console.log(`[loadFleets] profileId=${profileId} namespace=${namespace} files=${fleetFiles.length}`);

    for (const file of fleetFiles) {
      const filePath = path.join(dir, file);
      const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const payload = parsed?.data || parsed;
        const fleetEntries = Array.isArray(payload) ? payload : [payload];

        for (const fleetEntry of fleetEntries) {
          const fleetInfo = collectFleetInfo(fleetEntry, file.replace(/\.json$/, ''), isRented);
          if (!fleetInfo) continue;
          fleetsMap.set(fleetInfo.key, fleetInfo);
          loadedFromNamespace += 1;
        }
      } catch {
        console.log(`[loadFleets] skipped malformed file ${file}`);
      }
    }

    console.log(`[loadFleets] profileId=${profileId} namespace=${namespace} loaded=${loadedFromNamespace}`);
  };

  await loadFleetNamespace('fleets', false);
  await loadFleetNamespace('rented-fleets', true);

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
  const normalizeName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const decodedNames = Array.isArray(op?.decoded)
    ? op.decoded
        .filter((entry: any) => entry && entry.name)
        .map((entry: any) => String(entry.name))
    : [];

  const exactPreferences = [
    'ClaimCraftingOutputs',
    'BurnCraftingConsumables',
    'SubmitStarbaseUpgradeResource',
    'CreateStarbaseUpgradeResourceProcess',
    'DepositCraftingIngredient',
    'StartCraftingProcess',
    'CloseUpgradeProcess',
    'ScanForSurveyDataUnits',
    'DepositCargoToFleet',
    'WithdrawCargoFromFleet',
    'FleetStateHandler_MineAsteroid',
    'StartMiningAsteroid'
  ];

  for (const preferredName of exactPreferences) {
    const preferredKey = normalizeName(preferredName);
    const matchedName = decodedNames.find((decodedName) => normalizeName(decodedName) === preferredKey);
    if (matchedName) {
      return matchedName;
    }
  }

  const fuzzyPreferences = ['buy', 'scan', 'survey', 'claim', 'craft', 'mine'];
  for (const preferredPattern of fuzzyPreferences) {
    const matchedName = decodedNames.find((decodedName) => normalizeName(decodedName).includes(preferredPattern));
    if (matchedName) {
      return matchedName;
    }
  }

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

function normalizeOperationKey(operationName: string): string {
  return operationName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function canOperationClaimResources(operationName: string): boolean {
  const key = normalizeOperationKey(operationName);
  if (key.includes('burncraftingconsumables')) {
    return false;
  }

  return key.includes('claimcraftingoutputs') || key.includes('mine') || key.includes('buy') || key.includes('scan');
}

function canOperationBurnResources(operationName: string): boolean {
  const key = normalizeOperationKey(operationName);

  if (key.includes('createstarbaseupgraderesourceprocess')) {
    return false;
  }

  if (key.includes('burncraftingconsumables')) {
    return true;
  }

  if (
    key.includes('submitstarbaseupgraderesource') ||
    key.includes('createstarbaseupgraderesourceprocess') ||
    key.includes('depositcraftingingredient') ||
    key.includes('startcraftingprocess') ||
    key.includes('closeupgradeprocess')
  ) {
    return true;
  }

  return key.includes('mine') || key.includes('subwarp') || key.includes('warp') || key.includes('scan') || key.includes('sell');
}

function operationHasDecodedName(op: any, normalizedName: string): boolean {
  if (!Array.isArray(op?.decoded) || !normalizedName) {
    return false;
  }

  const expected = normalizeOperationKey(normalizedName);
  return op.decoded.some((entry: any) => {
    const name = entry?.name;
    if (!name) return false;
    return normalizeOperationKey(String(name)) === expected;
  });
}

function buildOwnedAccountOwners(fleetsMap: Map<string, FleetInfo>): Set<string> {
  const owners = new Set<string>();

  for (const fleet of fleetsMap.values()) {
    const keys = [
      fleet.cargoKey,
      fleet.cargoHold,
      fleet.ammoKey,
      fleet.ammoBank,
      fleet.fuelKey,
      fleet.fuelTank
    ];

    for (const key of keys) {
      if (key && key.trim()) {
        owners.add(key);
      }
    }
  }

  return owners;
}

async function loadStarbaseCargoOwners(profileId: string): Promise<Set<string>> {
  const owners = new Set<string>();
  const cached = await getCache('cargo-ids', 'starbase', profileId);
  const payload = cached?.data || cached;
  const starbaseCargoIds = Array.isArray(payload?.starbaseCargoIds) ? payload.starbaseCargoIds : [];

  for (const cargoId of starbaseCargoIds) {
    if (typeof cargoId !== 'string') {
      continue;
    }
    const trimmed = cargoId.trim();
    if (trimmed) {
      owners.add(trimmed);
    }
  }

  return owners;
}

async function decodeResources(profileId: string): Promise<ResourceFlowSummary> {
  console.log(`[decodeResources] START profileId=${profileId}`);
  const fleetsMap = await loadFleets(profileId);
  const operations = await loadOperationsFromCache(profileId);
  const baseOwnedAccountOwners = buildOwnedAccountOwners(fleetsMap);
  const starbaseCargoOwners = await loadStarbaseCargoOwners(profileId);
  for (const owner of starbaseCargoOwners) {
    baseOwnedAccountOwners.add(owner);
  }

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
      isRented: fleet.isRented,
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
    const extractedOperationName = extractOperationName(op);
    const fleetKey = op._fleetKey;
    const hasSubmitStarbaseUpgradeResource = operationHasDecodedName(op, 'SubmitStarbaseUpgradeResource');
    const hasCraftingClaimOutputs = operationHasDecodedName(op, 'ClaimCraftingOutputs');
    const hasScanForSurveyDataUnits = operationHasDecodedName(op, 'ScanForSurveyDataUnits');
    const hasBurnCraftingConsumables = operationHasDecodedName(op, 'BurnCraftingConsumables');
    const hasStarbaseUpgradeBurn =
      hasSubmitStarbaseUpgradeResource ||
      operationHasDecodedName(op, 'CreateStarbaseUpgradeResourceProcess') ||
      operationHasDecodedName(op, 'DepositCraftingIngredient') ||
      operationHasDecodedName(op, 'StartCraftingProcess') ||
      operationHasDecodedName(op, 'CloseUpgradeProcess');
    const isMixedCraftFlow = hasCraftingClaimOutputs && hasBurnCraftingConsumables;
    const operationName = hasCraftingClaimOutputs
      ? 'ClaimCraftingOutputs'
      : hasSubmitStarbaseUpgradeResource
        ? 'SubmitStarbaseUpgradeResource'
        : extractedOperationName;
    const operationCanClaim = canOperationClaimResources(operationName) || hasCraftingClaimOutputs;
    const operationCanBurn =
      canOperationBurnResources(operationName) ||
      hasBurnCraftingConsumables ||
      hasSubmitStarbaseUpgradeResource;
    const shouldDiscoverClaimOwners = hasCraftingClaimOutputs || hasScanForSurveyDataUnits;
    const shouldDiscoverBurnOwners = hasBurnCraftingConsumables || hasStarbaseUpgradeBurn;
    const claimOwners = new Set<string>();
    const burnOwners = new Set<string>();
    const claimMints = new Set<string>();
    const opOwnedOwners = new Set<string>(baseOwnedAccountOwners);

    if (shouldDiscoverClaimOwners) {
      for (const delta of deltas.deltas) {
        if (delta.delta > 0 && delta.owner && delta.owner.trim()) {
          claimOwners.add(delta.owner);
          claimMints.add(delta.mint);
          opOwnedOwners.add(delta.owner);
        }
      }

      for (const minted of deltas.minted) {
        if (minted.amount > 0 && minted.owner && minted.owner.trim()) {
          claimOwners.add(minted.owner);
          claimMints.add(minted.mint);
          opOwnedOwners.add(minted.owner);
        }
      }
    }

    if (shouldDiscoverBurnOwners) {
      for (const delta of deltas.deltas) {
        if (delta.delta < 0 && delta.owner && delta.owner.trim()) {
          if (isMixedCraftFlow && !baseOwnedAccountOwners.has(delta.owner)) {
            continue;
          }

          burnOwners.add(delta.owner);
          opOwnedOwners.add(delta.owner);
        }
      }

      for (const burned of deltas.burned) {
        if (burned.amount > 0 && burned.owner && burned.owner.trim()) {
          if (isMixedCraftFlow && !baseOwnedAccountOwners.has(burned.owner)) {
            continue;
          }

          burnOwners.add(burned.owner);
          opOwnedOwners.add(burned.owner);
        }
      }
    }

    if (!operationCanClaim && !operationCanBurn) {
      continue;
    }

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

    const operationKey = normalizeOperationKey(operationName);
    const isMoveSubwarpOperation = operationKey.includes('fleetstatehandlermovesubwarp');
    const isTraderMarketOperation =
      operationKey.includes('tradermarketbuy') ||
      operationKey.includes('tradermarketsell') ||
      operationKey.includes('tradermarketexchange');
    const mintOwnedFlows = new Map<string, { in: number; out: number }>();
    const mintGlobalFlows = new Map<string, { in: number; out: number }>();

    for (const delta of deltas.deltas) {
      const globalFlow = mintGlobalFlows.get(delta.mint) || { in: 0, out: 0 };
      if (delta.delta > 0) {
        globalFlow.in += delta.delta;
      } else {
        globalFlow.out += Math.abs(delta.delta);
      }
      mintGlobalFlows.set(delta.mint, globalFlow);

      if (!delta.owner || !opOwnedOwners.has(delta.owner)) {
        continue;
      }

      if (isMixedCraftFlow) {
        if (delta.delta > 0) {
          if (!claimOwners.has(delta.owner) && !baseOwnedAccountOwners.has(delta.owner)) {
            continue;
          }
        } else if (delta.delta < 0) {
          if (!burnOwners.has(delta.owner) && !baseOwnedAccountOwners.has(delta.owner)) {
            continue;
          }

          if (claimMints.has(delta.mint)) {
            continue;
          }
        }
      }

      const flow = mintOwnedFlows.get(delta.mint) || { in: 0, out: 0 };
      if (delta.delta > 0) {
        flow.in += delta.delta;
      } else {
        flow.out += Math.abs(delta.delta);
      }
      mintOwnedFlows.set(delta.mint, flow);
    }

    if (operationCanClaim) {
      for (const minted of deltas.minted) {
        if (!minted.owner || !opOwnedOwners.has(minted.owner)) {
          continue;
        }

        if (minted.amount <= 0) {
          continue;
        }

        if (isMixedCraftFlow && !claimOwners.has(minted.owner) && !baseOwnedAccountOwners.has(minted.owner)) {
          continue;
        }

        const flow = mintOwnedFlows.get(minted.mint) || { in: 0, out: 0 };
        flow.in += minted.amount;
        mintOwnedFlows.set(minted.mint, flow);
      }
    }

    if (operationCanBurn) {
      for (const burned of deltas.burned) {
        if (!burned.owner || !opOwnedOwners.has(burned.owner)) {
          continue;
        }

        if (burned.amount <= 0) {
          continue;
        }

        if (isMixedCraftFlow) {
          if (!burnOwners.has(burned.owner) && !baseOwnedAccountOwners.has(burned.owner)) {
            continue;
          }

          if (claimMints.has(burned.mint)) {
            continue;
          }
        }

        const flow = mintOwnedFlows.get(burned.mint) || { in: 0, out: 0 };
        flow.out += burned.amount;
        mintOwnedFlows.set(burned.mint, flow);
      }
    }

    for (const [mint, flow] of mintOwnedFlows.entries()) {
      const internalTransferAmount = isMixedCraftFlow || isTraderMarketOperation ? 0 : Math.min(flow.in, flow.out);
      const effectiveIn = Math.max(0, flow.in - internalTransferAmount);
      const effectiveOut = Math.max(0, flow.out - internalTransferAmount);
      const filteredIn = operationCanClaim ? effectiveIn : 0;
      let filteredOut = operationCanBurn ? effectiveOut : 0;

      if (isMoveSubwarpOperation && filteredOut > 0) {
        const globalFlow = mintGlobalFlows.get(mint) || { in: 0, out: 0 };
        const globalInternalTransferAmount = Math.min(globalFlow.in, globalFlow.out);
        const globalEffectiveOut = Math.max(0, globalFlow.out - globalInternalTransferAmount);
        filteredOut = Math.min(filteredOut, globalEffectiveOut);
      }

      if (mint === 'SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM' && !hasSubmitStarbaseUpgradeResource) {
        filteredOut = 0;
      }

      if (filteredIn <= 0 && filteredOut <= 0) {
        continue;
      }

      const materialInfo = getMaterialInfo(mint);

      if (!byMaterial.has(mint)) {
        byMaterial.set(mint, {
          mint,
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
      const matRecord = byMaterial.get(mint)!;

      if (filteredIn > 0) {
        matRecord.totalIn += filteredIn;
        totalMaterialsIn += filteredIn;
        opRecord.materialsProduced[mint] = (opRecord.materialsProduced[mint] || 0) + filteredIn;
      }

      if (filteredOut > 0) {
        matRecord.totalOut += filteredOut;
        totalMaterialsOut += filteredOut;
        opRecord.materialsConsumed[mint] = (opRecord.materialsConsumed[mint] || 0) + filteredOut;
      }

      matRecord.net = matRecord.totalIn - matRecord.totalOut;

      if (!matRecord.operations[operationName]) {
        matRecord.operations[operationName] = { in: 0, out: 0, count: 0 };
      }
      matRecord.operations[operationName].in += filteredIn;
      matRecord.operations[operationName].out += filteredOut;
      matRecord.operations[operationName].count += 1;

      if (fleetKey && byFleet.has(fleetKey)) {
        const fleetRecord = byFleet.get(fleetKey)!;

        if (!fleetRecord.materials[mint]) {
          fleetRecord.materials[mint] = {
            mint,
            name: materialInfo.name || 'Unknown',
            in: 0,
            out: 0,
            net: 0,
            operations: {}
          };
        }

        const fleetMatRecord = fleetRecord.materials[mint];
        if (filteredIn > 0) {
          fleetMatRecord.in += filteredIn;
          fleetRecord.totalMaterialsIn += filteredIn;
        }
        if (filteredOut > 0) {
          fleetMatRecord.out += filteredOut;
          fleetRecord.totalMaterialsOut += filteredOut;
        }

        fleetMatRecord.net = fleetMatRecord.in - fleetMatRecord.out;

        if (!fleetMatRecord.operations[operationName]) {
          fleetMatRecord.operations[operationName] = { in: 0, out: 0, count: 0 };
        }
        fleetMatRecord.operations[operationName].in += filteredIn;
        fleetMatRecord.operations[operationName].out += filteredOut;
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

