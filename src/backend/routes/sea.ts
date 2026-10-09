import express from 'express';
import { BorshAccountsCoder, BorshCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import { fetchProfileFleets } from '../../utils/fetchProfileFleets.js';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';

const router = express.Router();
const SAGE_PROGRAM_ID = new PublicKey('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE');
const sageIdl = JSON.parse(fs.readFileSync(new URL('../idl/sage_idl.json', import.meta.url), 'utf8'));
const coder = new BorshCoder(sageIdl);
const ACCOUNT_FILTER = (name: string) => ({ memcmp: { offset: 0, bytes: bs58.encode(BorshAccountsCoder.accountDiscriminator(name)) } });
const SNAPSHOT_TTL_MS = 15_000;
const STARBASE_TTL_MS = 24 * 60 * 60 * 1000;
const SIZE_KEYS = ['xx_small', 'x_small', 'small', 'medium', 'large', 'capital', 'commander', 'titan'];
const SIZE_NAMES = ['xxSmall', 'xSmall', 'small', 'medium', 'large', 'capital', 'commander', 'titan'];
const FACTIONS = ['Unaligned', 'MUD', 'ONI', 'Ustur'];

type SeaFleet = {
  id: string;
  name: string;
  borrowed: boolean;
  size: string;
  ships: number;
  state: string;
  sector: number[] | null;
  from: number[] | null;
  to: number[] | null;
  departure: number;
  arrival: number;
  scanCooldownEnd: number;
};

const snapshotCache = new Map<string, { expiresAt: number; value: any }>();
const snapshotPending = new Map<string, Promise<any>>();
let starbaseCache: { expiresAt: number; value: any[] } | null = null;
let starbasePending: Promise<any[]> | null = null;

function asNumber(value: any): number {
  return typeof value?.toNumber === 'function' ? value.toNumber() : Number(value ?? 0);
}

function accountSector(account: any): number[] {
  return account.sector.map(asNumber);
}

function label(bytes: number[] | Uint8Array): string {
  return Buffer.from(bytes).toString('utf8').replace(/\0/g, '').trim();
}

function largestSize(counts: Record<string, number>): string {
  for (let index = SIZE_KEYS.length - 1; index >= 0; index -= 1) {
    if (Number(counts[SIZE_KEYS[index]] ?? 0) > 0) return SIZE_NAMES[index];
  }
  return 'small';
}

async function withRpc<T>(profileId: string, action: (connection: any) => Promise<T>): Promise<T> {
  const pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 3000, allowStale: true });
  const startedAt = Date.now();
  try {
    const value = await action(pick.connection);
    pick.release({ success: true, latencyMs: Date.now() - startedAt });
    return value;
  } catch (error) {
    pick.release({ success: false, errorType: 'error' });
    throw error;
  }
}

async function resolveSectors(profileId: string, fleets: any[]): Promise<Map<string, number[]>> {
  const refs = new Map<string, 'Planet' | 'Starbase'>();
  for (const fleet of fleets) {
    const state = fleet.fleet_state;
    if (state?.type === 'MineAsteroid' && state.asteroid) refs.set(state.asteroid, 'Planet');
    if (state?.type === 'StarbaseLoadingBay' && state.starbase) refs.set(state.starbase, 'Starbase');
  }
  const entries = [...refs.entries()];
  const sectors = new Map<string, number[]>();
  for (let start = 0; start < entries.length; start += 100) {
    const batch = entries.slice(start, start + 100);
    const infos = await withRpc(profileId, connection => connection.getMultipleAccountsInfo(
      batch.map(([key]) => new PublicKey(key)), 'confirmed'
    ));
    batch.forEach(([key, type], index) => {
      const info = infos[index];
      if (!info) return;
      try {
        sectors.set(key, accountSector(coder.accounts.decode(type, info.data)));
      } catch {
        return;
      }
    });
  }
  return sectors;
}

function toSeaFleet(fleet: any, borrowedIds: Set<string>, sectors: Map<string, number[]>): SeaFleet {
  const raw = fleet.fleet_state ?? {};
  const state = raw.type ?? 'Unknown';
  const result: SeaFleet = {
    id: fleet.pubkey,
    name: fleet.fleet_label || fleet.pubkey.slice(0, 8),
    borrowed: borrowedIds.has(fleet.pubkey),
    size: largestSize(fleet.ship_counts ?? {}),
    ships: Number(fleet.ship_counts?.total ?? 0),
    state,
    sector: null,
    from: null,
    to: null,
    departure: 0,
    arrival: 0,
    scanCooldownEnd: Number(fleet.scan_cooldown_expires_at ?? 0) * 1000,
  };

  if (state === 'Idle' || state === 'Respawn') result.sector = raw.sector ?? null;
  if (state === 'MineAsteroid') result.sector = sectors.get(raw.asteroid) ?? null;
  if (state === 'StarbaseLoadingBay') result.sector = sectors.get(raw.starbase) ?? null;
  if (state === 'MoveWarp' || state === 'MoveSubwarp') {
    result.from = raw.from_sector ?? null;
    result.to = raw.to_sector ?? null;
    result.departure = Number(state === 'MoveWarp' ? raw.warp_start : raw.departure_time) * 1000;
    result.arrival = Number(state === 'MoveWarp' ? raw.warp_finish : raw.arrival_time) * 1000;
  }
  return result;
}

async function createSnapshot(profileId: string) {
  const [owned, borrowed] = await Promise.all([
    fetchProfileFleets(profileId, 41, false, false, false),
    fetchProfileFleets(profileId, 105, false, false, false),
  ]);
  const borrowedIds = new Set(borrowed.map(fleet => fleet.pubkey));
  const fleets = [...new Map([...owned, ...borrowed].map(fleet => [fleet.pubkey, fleet])).values()];
  const sectors = await resolveSectors(profileId, fleets);
  return {
    profileId,
    updatedAt: Date.now(),
    error: null,
    fleets: fleets.map(fleet => toSeaFleet(fleet, borrowedIds, sectors)),
  };
}

async function getSnapshot(profileId: string) {
  const cached = snapshotCache.get(profileId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = snapshotPending.get(profileId);
  if (pending) return pending;
  const request = createSnapshot(profileId).then(value => {
    snapshotCache.set(profileId, { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value });
    return value;
  }).finally(() => snapshotPending.delete(profileId));
  snapshotPending.set(profileId, request);
  return request;
}

async function fetchStarbases(): Promise<any[]> {
  return withRpc('default', async connection => {
    const [starbaseAccounts, planetAccounts] = await Promise.all([
      connection.getProgramAccounts(SAGE_PROGRAM_ID, { filters: [ACCOUNT_FILTER('Starbase')], commitment: 'confirmed' }),
      connection.getProgramAccounts(SAGE_PROGRAM_ID, { filters: [ACCOUNT_FILTER('Planet')], commitment: 'confirmed' }),
    ]);
    const systems = new Map<string, string>();
    for (const account of planetAccounts) {
      const planet = coder.accounts.decode('Planet', account.account.data);
      const sector = accountSector(planet);
      const key = sector.join(',');
      if (systems.has(key)) continue;
      const parts = label(planet.name).split('-');
      systems.set(key, parts.length > 1 ? `${parts[0]}-${parts[1]}` : parts[0]);
    }
    return starbaseAccounts.map(account => {
      const starbase = coder.accounts.decode('Starbase', account.account.data);
      const sector = accountSector(starbase);
      const faction = FACTIONS[Number(starbase.faction)] ?? 'Unknown';
      const system = systems.get(sector.join(','));
      const name = Number(starbase.level) >= 6
        ? `${(system ?? faction).split('-')[0]} CSS`
        : system ?? `${faction} (${sector[0]},${sector[1]})`;
      return { id: account.pubkey.toBase58(), name, sector, faction, level: Number(starbase.level) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  });
}

async function getStarbases() {
  if (starbaseCache && starbaseCache.expiresAt > Date.now()) return starbaseCache.value;
  if (starbasePending) return starbasePending;
  starbasePending = fetchStarbases().then(value => {
    starbaseCache = { expiresAt: Date.now() + STARBASE_TTL_MS, value };
    return value;
  }).finally(() => { starbasePending = null; });
  return starbasePending;
}

router.get('/sea/snapshot', async (req, res) => {
  const input = req.query.profileId;
  if (typeof input !== 'string') return res.status(400).json({ error: 'INVALID_PROFILE_ID' });
  let profileId: string;
  try {
    profileId = new PublicKey(input).toBase58();
  } catch {
    return res.status(400).json({ error: 'INVALID_PROFILE_ID' });
  }
  try {
    return res.json(await getSnapshot(profileId));
  } catch {
    return res.status(503).json({ profileId, updatedAt: 0, error: 'SEA_SNAPSHOT_UNAVAILABLE', fleets: [] });
  }
});

router.get('/sea/starbases', async (_req, res) => {
  try {
    return res.json(await getStarbases());
  } catch {
    return res.status(503).json({ error: 'SEA_STARBASES_UNAVAILABLE' });
  }
});

export default router;