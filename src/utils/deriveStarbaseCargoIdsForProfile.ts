import fs from 'fs/promises';
import path from 'path';
import { getCache, setCache } from './cache.js';

type CargoLifecycleState = 'ACTIVE' | 'CLOSED';

type StarbaseCargoState = {
  state: CargoLifecycleState;
  firstSeenSlot: number | null;
  lastSeenSlot: number | null;
  sources: string[];
};

export type StarbaseCargoIdsResult = {
  profileId: string;
  generatedAt: number;
  starbaseAuthorities: string[];
  starbaseCargoIds: string[];
  starbaseCargoState: Record<string, StarbaseCargoState>;
};

const STARBASE_CARGO_KEYS = new Set<string>([
  'createcargopod',
  'removecargopod',
  'depositcargotogame',
  'devdepositcargotogame',
  'withdrawcargofromgame',
  'transfercargoatstarbase',
  'closestarbasecargotokenaccount'
]);

const STARBASE_CLOSE_KEYS = new Set<string>([
  'removecargopod',
  'closestarbasecargotokenaccount'
]);

function normalizeOperationKey(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toPubkeySet(values: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      out.add(value);
      continue;
    }

    if (value && typeof value === 'object' && typeof (value as any).pubkey === 'string') {
      const pubkey = String((value as any).pubkey).trim();
      if (pubkey) out.add(pubkey);
    }
  }

  return out;
}

function collectDecodedNames(op: any): string[] {
  const names: string[] = [];

  if (typeof op?.instructionName === 'string' && op.instructionName.trim()) {
    names.push(op.instructionName);
  }

  if (!Array.isArray(op?.decoded)) {
    return names;
  }

  for (const entry of op.decoded) {
    if (!entry || typeof entry.name !== 'string') {
      continue;
    }
    names.push(entry.name);
  }

  return names;
}

function collectRelevantNames(op: any): string[] {
  const decodedNames = collectDecodedNames(op);
  const relevant: string[] = [];

  for (const name of decodedNames) {
    if (STARBASE_CARGO_KEYS.has(normalizeOperationKey(name))) {
      relevant.push(name);
    }
  }

  return relevant;
}

function collectOperationAccountKeys(op: any): Set<string> {
  const txInfo = op?.txInfo || {};
  const keys = new Set<string>();

  const staticKeys = Array.isArray(txInfo.staticAccountKeys) ? txInfo.staticAccountKeys : [];
  const accountKeys = Array.isArray(txInfo.accountKeys) ? txInfo.accountKeys : [];

  const merged = toPubkeySet([...staticKeys, ...accountKeys]);
  for (const key of merged) keys.add(key);

  return keys;
}

function operationTouchesAllowedWallet(op: any, allowedWallets: Set<string>): boolean {
  if (allowedWallets.size === 0) {
    return true;
  }

  const accountKeys = collectOperationAccountKeys(op);
  for (const wallet of allowedWallets) {
    if (accountKeys.has(wallet)) {
      return true;
    }
  }

  return false;
}

function collectTokenOwners(op: any): Set<string> {
  const txInfo = op?.txInfo || {};
  const pre = Array.isArray(txInfo.preTokenBalances) ? txInfo.preTokenBalances : [];
  const post = Array.isArray(txInfo.postTokenBalances) ? txInfo.postTokenBalances : [];
  const owners = new Set<string>();

  const addOwner = (entry: any) => {
    const owner = typeof entry?.owner === 'string' ? entry.owner.trim() : '';
    if (owner) owners.add(owner);
  };

  for (const entry of pre) addOwner(entry);
  for (const entry of post) addOwner(entry);

  return owners;
}

function slotOfOperation(op: any): number | null {
  const slotRaw = op?.txInfo?.slot;
  const slot = Number(slotRaw);
  if (!Number.isFinite(slot)) {
    return null;
  }
  return slot;
}

function updateCargoState(
  stateByCargo: Map<string, StarbaseCargoState>,
  cargoId: string,
  slot: number | null,
  isCloseOperation: boolean,
  sources: string[]
): void {
  const existing = stateByCargo.get(cargoId);

  if (!existing) {
    stateByCargo.set(cargoId, {
      state: isCloseOperation ? 'CLOSED' : 'ACTIVE',
      firstSeenSlot: slot,
      lastSeenSlot: slot,
      sources: [...sources]
    });
    return;
  }

  if (slot !== null) {
    if (existing.firstSeenSlot === null || slot < existing.firstSeenSlot) {
      existing.firstSeenSlot = slot;
    }
    if (existing.lastSeenSlot === null || slot > existing.lastSeenSlot) {
      existing.lastSeenSlot = slot;
    }
  }

  if (isCloseOperation) {
    existing.state = 'CLOSED';
  } else if (existing.state !== 'CLOSED') {
    existing.state = 'ACTIVE';
  }

  for (const source of sources) {
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
  }
}

async function loadAllowedWallets(profileId: string): Promise<Set<string>> {
  const wallets = new Set<string>();
  const cachedMeta = await getCache('', profileId, profileId);
  const meta = cachedMeta?.data || cachedMeta;
  const allowedWallets = Array.isArray(meta?.allowedWallets) ? meta.allowedWallets : [];

  for (const entry of allowedWallets) {
    const pubkey = typeof entry === 'string' ? entry : entry?.pubkey;
    if (typeof pubkey === 'string' && pubkey.trim()) {
      wallets.add(pubkey);
    }
  }

  return wallets;
}

function addFleetCargoCandidate(out: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  if (trimmed) {
    out.add(trimmed);
  }
}

function collectFleetCargoFromEntry(out: Set<string>, entry: any): void {
  const candidates = [
    entry?.cargo_hold,
    entry?.fuel_tank,
    entry?.ammo_bank,
    entry?.cargoHold,
    entry?.fuelTank,
    entry?.ammoBank,
    entry?.data?.cargoHold,
    entry?.data?.fuelTank,
    entry?.data?.ammoBank,
    entry?.fleetData?.cargo_hold,
    entry?.fleetData?.fuel_tank,
    entry?.fleetData?.ammo_bank,
    entry?.fleetData?.cargoHold,
    entry?.fleetData?.fuelTank,
    entry?.fleetData?.ammoBank,
    entry?.fleetData?.data?.cargoHold,
    entry?.fleetData?.data?.fuelTank,
    entry?.fleetData?.data?.ammoBank
  ];

  for (const candidate of candidates) {
    addFleetCargoCandidate(out, candidate);
  }
}

async function loadFleetCargoIds(profileId: string): Promise<Set<string>> {
  const fleetCargoIds = new Set<string>();
  const namespaces = ['fleets', 'rented-fleets'];

  for (const namespace of namespaces) {
    const dir = path.join(process.cwd(), 'cache', profileId, namespace);
    const files = await fs.readdir(dir).catch(() => []);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (!raw) {
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        const payload = parsed?.data || parsed;
        const entries = Array.isArray(payload) ? payload : [payload];
        for (const entry of entries) {
          collectFleetCargoFromEntry(fleetCargoIds, entry);
        }
      } catch {
        // ignore malformed cache entries
      }
    }
  }

  return fleetCargoIds;
}

async function loadOperationsFromCache(profileId: string): Promise<any[]> {
  const operations: any[] = [];
  const breakdownDir = path.join(process.cwd(), 'cache', profileId, 'fleet-breakdowns');
  const playerOpsDir = path.join(process.cwd(), 'cache', profileId, 'player-ops');

  const breakdownFiles = await fs.readdir(breakdownDir).catch(() => []);
  for (const file of breakdownFiles) {
    const filePath = path.join(breakdownDir, file);
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const payload = parsed?.data || parsed;
      const ops = Array.isArray(payload?.ops) ? payload.ops : [];
      operations.push(...ops);
    } catch {
      // ignore malformed entries
    }
  }

  const playerOpsFiles = await fs.readdir(playerOpsDir).catch(() => []);
  for (const file of playerOpsFiles) {
    const filePath = path.join(playerOpsDir, file);
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      operations.push(parsed?.data || parsed);
    } catch {
      // ignore malformed entries
    }
  }

  return operations;
}

export async function deriveStarbaseCargoIdsForProfile(profileId: string): Promise<StarbaseCargoIdsResult> {
  const allowedWallets = await loadAllowedWallets(profileId);
  const fleetCargoIds = await loadFleetCargoIds(profileId);
  const operations = await loadOperationsFromCache(profileId);
  const starbaseCargoState = new Map<string, StarbaseCargoState>();

  for (const op of operations) {
    const relevantNames = collectRelevantNames(op);
    if (relevantNames.length === 0) {
      continue;
    }

    if (!operationTouchesAllowedWallet(op, allowedWallets)) {
      continue;
    }

    const sourceOwners = collectTokenOwners(op);
    if (sourceOwners.size === 0) {
      continue;
    }

    const normalizedNames = relevantNames.map((name) => normalizeOperationKey(name));
    const isCloseOperation = normalizedNames.some((name) => STARBASE_CLOSE_KEYS.has(name));
    const slot = slotOfOperation(op);

    for (const owner of sourceOwners) {
      if (allowedWallets.has(owner)) {
        continue;
      }
      if (fleetCargoIds.has(owner)) {
        continue;
      }

      updateCargoState(starbaseCargoState, owner, slot, isCloseOperation, relevantNames);
    }
  }

  const starbaseCargoIds = Array.from(starbaseCargoState.keys()).sort();
  const result: StarbaseCargoIdsResult = {
    profileId,
    generatedAt: Date.now(),
    starbaseAuthorities: Array.from(allowedWallets).sort(),
    starbaseCargoIds,
    starbaseCargoState: Object.fromEntries(starbaseCargoState)
  };

  await setCache('cargo-ids', 'starbase', result, profileId);
  return result;
}

export default deriveStarbaseCargoIdsForProfile;