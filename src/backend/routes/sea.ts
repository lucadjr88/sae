import express from 'express';
import anchor from '@coral-xyz/anchor';
import { ComputeBudgetInstruction, ComputeBudgetProgram, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_SLOT_HASHES_PUBKEY, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CargoType, CARGO_IDL } from '@staratlas/cargo';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import fs from 'fs';
import { fetchProfileFleets } from '../../utils/fetchProfileFleets.js';
import { getWalletAuthorityUtil } from '../../utils/getWalletAuthority.js';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';

const { AnchorProvider, BN, BorshAccountsCoder, BorshCoder, Program } = anchor;
const router = express.Router();
const SAGE_PROGRAM_ID = new PublicKey('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE');
const CARGO_PROGRAM_ID = new PublicKey('Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk');
const POINTS_PROGRAM_ID = new PublicKey('Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM');
const PROFILE_FACTION_PROGRAM_ID = new PublicKey('pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq');
const DATA_RUNNING_XP_CATEGORY = new PublicKey('DataJpxFgHhzwu4zYJeHCnAv21YqWtanEBphNxXBHdEY');
const COUNCIL_RANK_XP_CATEGORY = new PublicKey('XPneyd1Wvoay3aAa24QiKyPjs8SUbZnGg5xvpKvTgN9');
const PILOTING_XP_CATEGORY = new PublicKey('PiLotBQoUBUvKxMrrQbuR3qDhqgwLJctWsXj3uR7fGs');
const sageIdl = JSON.parse(fs.readFileSync(new URL('../idl/sage_idl.json', import.meta.url), 'utf8'));
const coder = new BorshCoder(sageIdl);
const ACCOUNT_FILTER = (name: string) => ({ memcmp: { offset: 0, bytes: bs58.encode(BorshAccountsCoder.accountDiscriminator(name)) } });
const SNAPSHOT_TTL_MS = 15_000;
const STARBASE_TTL_MS = 24 * 60 * 60 * 1000;
const SIZE_KEYS = ['xx_small', 'x_small', 'small', 'medium', 'large', 'capital', 'commander', 'titan'];
const SIZE_NAMES = ['xxSmall', 'xSmall', 'small', 'medium', 'large', 'capital', 'commander', 'titan'];
const FACTIONS = ['Unaligned', 'MUD', 'ONI', 'Ustur'];

function makePriorityFeePolicy(feeModeInput: unknown, baseFeeInput: unknown, multiplierPercent: number) {
  if (feeModeInput != null && feeModeInput !== 'sly' && feeModeInput !== 'wallet') throw new Error('INVALID_FEE_MODE');
  const mode: 'sly' | 'wallet' = feeModeInput === 'wallet' ? 'wallet' : 'sly';
  if (mode === 'wallet') {
    return { mode, baseLamports: 0, microLamportsPerCu: 0, estimatedPriorityFeeLamports: 0, instruction: null };
  }

  const baseLamports = baseFeeInput == null ? 1 : Number(baseFeeInput);
  if (!Number.isSafeInteger(baseLamports) || baseLamports < 0 || baseLamports > 50_000) {
    throw new Error('INVALID_SLY_PRIORITY_FEE');
  }
  const microLamportsPerCu = baseLamports === 0
    ? 0
    : Math.max(1, Math.ceil((multiplierPercent / 100) * baseLamports * 5));
  return {
    mode,
    baseLamports,
    microLamportsPerCu,
    estimatedPriorityFeeLamports: Math.ceil(microLamportsPerCu / 5),
    instruction: microLamportsPerCu > 0
      ? ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerCu })
      : null,
  };
}

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
  chainData: Record<string, unknown>;
};

const snapshotCache = new Map<string, { expiresAt: number; value: any }>();
const snapshotPending = new Map<string, Promise<any>>();
type ScanPreparation = {
  action: 'scan' | 'subwarp_start' | 'warp_start' | 'subwarp_exit' | 'warp_exit';
  profileId: string;
  fleetId: string;
  wallet: string;
  transaction: VersionedTransaction;
  sduTokenAccount?: string;
  sduMint?: string;
  feePolicy?: {
    mode: 'sly' | 'wallet';
    baseLamports: number;
    microLamportsPerCu: number;
    estimatedPriorityFeeLamports: number;
  };
  blockhash: string;
  lastValidBlockHeight: number;
  expiresAt: number;
};
const scanPreparations = new Map<string, ScanPreparation>();
const scanPreparationDirectory = path.join(process.cwd(), 'cache', 'sea-preparations');

function scanPreparationPath(prepareId: string): string {
  return path.join(scanPreparationDirectory, `${prepareId}.json`);
}

async function pruneScanPreparations(now: number): Promise<void> {
  for (const [id, item] of scanPreparations) if (item.expiresAt <= now) scanPreparations.delete(id);
  let filenames: string[];
  try {
    filenames = await fs.promises.readdir(scanPreparationDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(filenames.filter(filename => filename.endsWith('.json')).map(async filename => {
    const filePath = path.join(scanPreparationDirectory, filename);
    try {
      const item = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (Number(item.expiresAt) <= now) await fs.promises.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[sea] could not prune stored preparation', { file: filename, error: String(error) });
      }
    }
  }));
}

async function storeScanPreparation(prepareId: string, preparation: ScanPreparation): Promise<void> {
  await fs.promises.mkdir(scanPreparationDirectory, { recursive: true });
  const destination = scanPreparationPath(prepareId);
  const temporary = `${destination}.${process.pid}.tmp`;
  const stored = {
    ...preparation,
    transaction: Buffer.from(preparation.transaction.serialize()).toString('base64'),
  };
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => undefined);
    throw error;
  }
  scanPreparations.set(prepareId, preparation);
}

async function getScanPreparation(prepareId: string): Promise<ScanPreparation | undefined> {
  const cached = scanPreparations.get(prepareId);
  if (cached) return cached;
  try {
    const stored = JSON.parse(await fs.promises.readFile(scanPreparationPath(prepareId), 'utf8'));
    const preparation: ScanPreparation = {
      ...stored,
      transaction: VersionedTransaction.deserialize(Buffer.from(stored.transaction, 'base64')),
    };
    scanPreparations.set(prepareId, preparation);
    return preparation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function deleteScanPreparation(prepareId: string): Promise<void> {
  scanPreparations.delete(prepareId);
  try {
    await fs.promises.unlink(scanPreparationPath(prepareId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
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

function rpcErrorType(error: unknown): '429' | '503' | 'unsupported' | 'error' {
  const value = error as { status?: unknown; value?: { error?: { code?: unknown; message?: unknown } } };
  const status = typeof value?.status === 'number' ? value.status : undefined;
  const rpcCode = typeof value?.value?.error?.code === 'number' ? value.value.error.code : undefined;
  const rpcMessage = typeof value?.value?.error?.message === 'string' ? value.value.error.message : '';
  const message = `${error instanceof Error ? error.message : String(error ?? '')} ${rpcMessage}`;
  const stack = error instanceof Error ? error.stack ?? '' : '';
  if (
    /getProgramAccounts.{0,100}(?:paid plans only|upgrade your subscription)|Method ['"]getProgramAccounts['"] is available/i.test(message) ||
    (/Expected the value to satisfy a union of|failed to get accounts owned by program/i.test(message)
      && /Connection\.getProgramAccounts/.test(stack))
  ) return 'unsupported';
  if (status === 429 || /429|Too Many Requests/i.test(message)) return '429';
  if (status === 402 || /\b402\b|Payment Required|Out of CU/i.test(message)) return '503';
  if (status === 401 || status === 403 || /\b(?:401|403)\b|Unauthorized|Forbidden/i.test(message)) return '503';
  if (
    [408, 500, 502, 503, 504].includes(status ?? 0) ||
    rpcCode === -32603 ||
    /500|502|503|504|Service Unavailable|Internal JSON-RPC error|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|socket hang up/i.test(message)
  ) return '503';
  return 'error';
}

const MAX_WALLET_COMPUTE_UNITS = 1_400_000;
const MAX_WALLET_PRIORITY_FEE_LAMPORTS = 50_000n;

type ResolvedTransactionInstruction = {
  programId: PublicKey;
  accounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>;
  data: Buffer;
};

function getResolvedInstructions(transaction: VersionedTransaction): ResolvedTransactionInstruction[] | null {
  const message = transaction.message as any;
  if ((message.addressTableLookups?.length ?? 0) > 0) return null;
  const accountKeys: PublicKey[] = message.staticAccountKeys ?? message.accountKeys ?? [];
  const header = message.header;
  const compiledInstructions = message.compiledInstructions ?? message.instructions ?? [];
  const getAccount = (index: number) => {
    const pubkey = accountKeys[index];
    if (!pubkey) return null;
    const isSigner = index < header.numRequiredSignatures;
    const isWritable = isSigner
      ? index < header.numRequiredSignatures - header.numReadonlySignedAccounts
      : index < accountKeys.length - header.numReadonlyUnsignedAccounts;
    return { pubkey, isSigner, isWritable };
  };

  const resolved: ResolvedTransactionInstruction[] = [];
  for (const instruction of compiledInstructions) {
    const programId = accountKeys[instruction.programIdIndex];
    const indexes: number[] = instruction.accountKeyIndexes ?? instruction.accounts ?? [];
    const accounts = indexes.map(getAccount);
    if (!programId || accounts.some(account => !account)) return null;
    resolved.push({
      programId,
      accounts: accounts as ResolvedTransactionInstruction['accounts'],
      data: Buffer.from(instruction.data),
    });
  }
  return resolved;
}

function validateWalletTransactionMessage(
  prepared: VersionedTransaction,
  signed: VersionedTransaction,
  feePolicy: ScanPreparation['feePolicy'],
): { valid: boolean; reason: string; computeUnitLimit?: number; microLamportsPerCu?: string } {
  const preparedMessage = prepared.message as any;
  const signedMessage = signed.message as any;
  if (preparedMessage.recentBlockhash !== signedMessage.recentBlockhash) {
    return { valid: false, reason: 'RECENT_BLOCKHASH_CHANGED' };
  }
  if (preparedMessage.header.numRequiredSignatures !== signedMessage.header.numRequiredSignatures) {
    return { valid: false, reason: 'REQUIRED_SIGNATURE_COUNT_CHANGED' };
  }
  const preparedKeys: PublicKey[] = preparedMessage.staticAccountKeys ?? preparedMessage.accountKeys ?? [];
  const signedKeys: PublicKey[] = signedMessage.staticAccountKeys ?? signedMessage.accountKeys ?? [];
  const signerKeys = (keys: PublicKey[], required: number) => keys.slice(0, required).map(key => key.toBase58()).sort();
  if (JSON.stringify(signerKeys(preparedKeys, preparedMessage.header.numRequiredSignatures))
    !== JSON.stringify(signerKeys(signedKeys, signedMessage.header.numRequiredSignatures))) {
    return { valid: false, reason: 'SIGNER_SET_CHANGED' };
  }
  const preparedInstructions = getResolvedInstructions(prepared);
  const signedInstructions = getResolvedInstructions(signed);
  if (!preparedInstructions || !signedInstructions) return { valid: false, reason: 'ADDRESS_LOOKUP_TABLES_NOT_ALLOWED' };

  const isComputeBudget = (instruction: ResolvedTransactionInstruction) => instruction.programId.equals(ComputeBudgetProgram.programId);
  const preparedCore = preparedInstructions.filter(instruction => !isComputeBudget(instruction));
  const signedCore = signedInstructions.filter(instruction => !isComputeBudget(instruction));
  const coreMatches = preparedCore.length === signedCore.length && preparedCore.every((instruction, index) => {
    const signedInstruction = signedCore[index];
    return instruction.programId.equals(signedInstruction.programId)
      && instruction.data.equals(signedInstruction.data)
      && instruction.accounts.length === signedInstruction.accounts.length
      && instruction.accounts.every((account, accountIndex) => {
        const signedAccount = signedInstruction.accounts[accountIndex];
        return account.pubkey.equals(signedAccount.pubkey)
          && account.isSigner === signedAccount.isSigner
          && account.isWritable === signedAccount.isWritable;
      });
  });
  if (!coreMatches) return { valid: false, reason: 'SAGE_INSTRUCTION_CHANGED' };

  let computeUnitLimit: number | undefined;
  let microLamportsPerCu: bigint | undefined;
  let foundNonBudget = false;
  for (const instruction of signedInstructions) {
    if (!isComputeBudget(instruction)) {
      foundNonBudget = true;
      continue;
    }
    if (foundNonBudget || instruction.accounts.length > 0) {
      return { valid: false, reason: 'INVALID_COMPUTE_BUDGET_POSITION_OR_ACCOUNTS' };
    }
    const decoded = new TransactionInstruction({
      programId: instruction.programId,
      keys: [],
      data: instruction.data,
    });
    let instructionType: ReturnType<typeof ComputeBudgetInstruction.decodeInstructionType>;
    try {
      instructionType = ComputeBudgetInstruction.decodeInstructionType(decoded);
    } catch {
      return { valid: false, reason: 'UNKNOWN_COMPUTE_BUDGET_INSTRUCTION' };
    }
    if (instructionType === 'SetComputeUnitLimit') {
      if (computeUnitLimit !== undefined) return { valid: false, reason: 'DUPLICATE_COMPUTE_UNIT_LIMIT' };
      computeUnitLimit = ComputeBudgetInstruction.decodeSetComputeUnitLimit(decoded).units;
      if (computeUnitLimit < 1 || computeUnitLimit > MAX_WALLET_COMPUTE_UNITS) {
        return { valid: false, reason: 'COMPUTE_UNIT_LIMIT_OUT_OF_RANGE' };
      }
    } else if (instructionType === 'SetComputeUnitPrice') {
      if (microLamportsPerCu !== undefined) return { valid: false, reason: 'DUPLICATE_COMPUTE_UNIT_PRICE' };
      microLamportsPerCu = BigInt(ComputeBudgetInstruction.decodeSetComputeUnitPrice(decoded).microLamports);
    } else {
      return { valid: false, reason: 'COMPUTE_BUDGET_INSTRUCTION_NOT_ALLOWED' };
    }
  }

  const expectedPrice = BigInt(feePolicy?.microLamportsPerCu ?? 0);
  const submittedPrice = microLamportsPerCu ?? 0n;
  if (feePolicy?.mode === 'sly' && submittedPrice !== expectedPrice) {
    return { valid: false, reason: 'SLY_PRIORITY_FEE_CHANGED' };
  }
  const feeComputeUnitLimit = BigInt(computeUnitLimit ?? MAX_WALLET_COMPUTE_UNITS);
  const priorityFeeLamports = (submittedPrice * feeComputeUnitLimit + 999_999n) / 1_000_000n;
  if (priorityFeeLamports > MAX_WALLET_PRIORITY_FEE_LAMPORTS) {
    return { valid: false, reason: 'WALLET_PRIORITY_FEE_TOO_HIGH' };
  }
  return {
    valid: true,
    reason: 'OK',
    computeUnitLimit,
    microLamportsPerCu: microLamportsPerCu?.toString(),
  };
}

function nextWarpWaypoint(maxWarpDistance: number, start: [number, number], end: [number, number]): [number, number] {
  const range = maxWarpDistance / 100;
  const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (distance <= range) return end;
  if (!(range > 0)) throw new Error('INVALID_WARP_RANGE');

  const slope = Math.abs(end[0] - start[0]) > 0
    ? Math.abs((end[1] - start[1]) / (end[0] - start[0]))
    : Math.abs(end[1] - start[1]);
  const deltaX = range / Math.sqrt(slope ** 2 + 1);
  const deltaY = deltaX * slope;
  const baseX = start[0] > end[0] ? start[0] - Math.trunc(deltaX) : start[0] + Math.trunc(deltaX);
  const baseY = start[1] > end[1] ? start[1] - Math.trunc(deltaY) : start[1] + Math.trunc(deltaY);
  const candidates: [number, number][] = [
    [baseX, baseY], [baseX - 1, baseY - 1], [baseX - 1, baseY], [baseX - 1, baseY + 1],
    [baseX, baseY - 1], [baseX, baseY + 1], [baseX + 1, baseY - 1], [baseX + 1, baseY], [baseX + 1, baseY + 1],
  ];
  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    const bestRemaining = Math.hypot(best[0] - end[0], best[1] - end[1]);
    const candidateRemaining = Math.hypot(candidate[0] - end[0], candidate[1] - end[1]);
    const bestTravel = Math.hypot(start[0] - best[0], start[1] - best[1]);
    const candidateTravel = Math.hypot(start[0] - candidate[0], start[1] - candidate[1]);
    if (
      (candidateRemaining <= range && candidateTravel <= range && candidateRemaining + candidateTravel < bestRemaining + bestTravel) ||
      (candidateRemaining <= range && candidateTravel <= range && bestRemaining > range) ||
      (candidateRemaining > range && candidateTravel <= range && candidateRemaining < bestRemaining)
    ) best = candidate;
  }
  if (best[0] === start[0] && best[1] === start[1]) throw new Error('WARP_WAYPOINT_NOT_FOUND');
  return best;
}

function warpFuelRequired(start: [number, number], end: [number, number], maxWarpDistance: number, fuelRate: number): number {
  let current = start;
  let total = 0;
  for (let jump = 0; jump < 1000 && (current[0] !== end[0] || current[1] !== end[1]); jump += 1) {
    const next = nextWarpWaypoint(maxWarpDistance, current, end);
    const distance = Math.hypot(next[0] - current[0], next[1] - current[1]);
    if (!(distance > 0)) throw new Error('WARP_WAYPOINT_NOT_FOUND');
    total += Math.ceil(distance * fuelRate / 100);
    current = next;
  }
  if (current[0] !== end[0] || current[1] !== end[1]) throw new Error('WARP_ROUTE_TOO_LONG');
  return total;
}

async function withRpc<T>(profileId: string, action: (connection: any) => Promise<T>, onRpc?: (endpoint: any) => void): Promise<T> {
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  const urls = new Set(pool.map(endpoint => endpoint?.url).filter((url): url is string => typeof url === 'string'));
  const maxAttempts = Math.max(1, urls.size);
  const excludedUrls = new Set<string>();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | undefined;
    let released = false;
    try {
      pick = await RpcPoolManager.pickRpcConnection(profileId, {
        waitForMs: 3000,
        allowStale: true,
        excludeUrls: excludedUrls,
      });
      onRpc?.(pick.endpoint);
      const startedAt = Date.now();
      const value = await action(pick.connection);
      released = true;
      pick.release({ success: true, latencyMs: Date.now() - startedAt });
      return value;
    } catch (error) {
      const errorType = rpcErrorType(error);
      if (pick) {
        const url = pick.endpoint?.url;
        if (typeof url === 'string') excludedUrls.add(url);
        if (!released) {
          released = true;
          pick.release({ success: false, errorType });
        }
      }
      if (errorType === 'error' || attempt + 1 >= maxAttempts) throw error;
      if (errorType !== 'unsupported') {
        if (attempt + 1 >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw new Error('No available RPC endpoint');
}

async function resolveSectors(profileId: string, fleets: any[], onRpc?: (endpoint: any) => void): Promise<Map<string, number[]>> {
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
    ), onRpc);
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
    chainData: fleet,
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

function seaRpc(endpoint: any): { name: string; host: string } {
  let host = 'unknown';
  try {
    host = new URL(endpoint?.url).host;
  } catch {
    // Keep the panel useful even if an endpoint has a non-standard URL.
  }
  return { name: String(endpoint?.name ?? host), host };
}

function isAllowedScanFilterHost(host: string): boolean {
  if (host === 'localhost') return true;
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  return first === 10 || first === 127 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function postScanFilter(url: string, payload: Record<string, unknown>, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const requestBody = Buffer.from(JSON.stringify(payload));
    const upstreamRequest = httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length,
      },
    }, upstreamResponse => {
      const chunks: Buffer[] = [];
      let responseSize = 0;
      upstreamResponse.on('data', chunk => {
        const buffer = Buffer.from(chunk);
        responseSize += buffer.length;
        if (responseSize > 1024 * 1024) {
          upstreamRequest.destroy(new Error('SCAN_FILTER_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(buffer);
      });
      upstreamResponse.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ status: upstreamResponse.statusCode ?? 502, body });
        } catch {
          reject(new Error('SCAN_FILTER_INVALID_JSON_RESPONSE'));
        }
      });
    });
    upstreamRequest.setTimeout(timeoutMs, () => upstreamRequest.destroy(new Error('SCAN_FILTER_UPSTREAM_TIMEOUT')));
    upstreamRequest.on('error', reject);
    upstreamRequest.end(requestBody);
  });
}

async function createSnapshot(profileId: string) {
  const rpcEndpoints = new Map<string, { name: string; host: string }>();
  const rememberRpc = (endpoint: any) => {
    const rpc = seaRpc(endpoint);
    rpcEndpoints.set(`${rpc.name}|${rpc.host}`, rpc);
  };
  const [owned, borrowed] = await Promise.all([
    fetchProfileFleets(profileId, 41, false, false, false, rememberRpc),
    fetchProfileFleets(profileId, 105, false, false, false, rememberRpc),
  ]);
  const borrowedIds = new Set(borrowed.map(fleet => fleet.pubkey));
  const fleets = [...new Map([...owned, ...borrowed].map(fleet => [fleet.pubkey, fleet])).values()];
  const sectors = await resolveSectors(profileId, fleets, rememberRpc);
  return {
    profileId,
    updatedAt: Date.now(),
    error: null,
    rpcEndpoints: [...rpcEndpoints.values()],
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

router.post('/sea/scan-filter', async (req, res) => {
  const host = typeof req.body?.host === 'string' ? req.body.host.trim() : '';
  const port = Number(req.body?.port);
  const timeoutSeconds = Number(req.body?.timeoutSeconds);
  const payload = req.body?.payload;
  if (!isAllowedScanFilterHost(host)) return res.status(400).json({ error: 'SCAN_FILTER_HOST_NOT_ALLOWED' });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ error: 'INVALID_SCAN_FILTER_PORT' });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: 'INVALID_SCAN_FILTER_PAYLOAD' });

  const timeoutMs = Math.max(1000, Math.min(60_000, (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 10) * 1000));
  const url = `http://${host}:${port}/api/scan-filter`;
  try {
    const upstream = await postScanFilter(url, payload, timeoutMs);
    return res.status(upstream.status).json(upstream.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] scan-filter proxy failed', {
      host,
      port,
      error: message.replace(/https?:\/\/\S+/g, '<upstream-url>'),
    });
    return res.status(502).json({ error: 'SCAN_FILTER_UPSTREAM_UNAVAILABLE' });
  }
});

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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] snapshot creation failed', {
      profileId,
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ profileId, updatedAt: 0, error: 'SEA_SNAPSHOT_UNAVAILABLE', fleets: [] });
  }
});

router.get('/sea/fleet-resources', async (req, res) => {
  const profileInput = req.query.profileId;
  const fleetInput = req.query.fleetId;
  if (typeof profileInput !== 'string' || typeof fleetInput !== 'string') {
    return res.status(400).json({ error: 'INVALID_PROFILE_OR_FLEET_ID' });
  }

  let profileId: string;
  let fleetId: string;
  try {
    profileId = new PublicKey(profileInput).toBase58();
    fleetId = new PublicKey(fleetInput).toBase58();
  } catch {
    return res.status(400).json({ error: 'INVALID_PROFILE_OR_FLEET_ID' });
  }

  try {
    const snapshot = await getSnapshot(profileId);
    const fleet = snapshot.fleets.find((item: SeaFleet) => item.id === fleetId);
    if (!fleet) return res.status(404).json({ error: 'FLEET_NOT_IN_PROFILE' });

    const chainData = fleet.chainData as any;
    const result = await withRpc(profileId, async connection => {
      const gameId = new PublicKey(chainData.game_id);
      const fuelTank = new PublicKey(chainData.fuel_tank);
      const cargoHold = new PublicKey(chainData.cargo_hold);
      const gameInfo = await connection.getAccountInfo(gameId, 'confirmed');
      if (!gameInfo || !gameInfo.owner.equals(SAGE_PROGRAM_ID)) throw new Error('INVALID_GAME_ACCOUNT');
      const game = coder.accounts.decode('Game', gameInfo.data);
      const fuelToken = getAssociatedTokenAddressSync(game.mints.fuel, fuelTank, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const foodToken = getAssociatedTokenAddressSync(game.mints.food, cargoHold, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const balanceForTokenAccount = async (tokenAccount: PublicKey) => {
        const accountInfo = await connection.getAccountInfo(tokenAccount, 'confirmed');
        if (!accountInfo) return 0;
        if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('INVALID_TOKEN_ACCOUNT_OWNER');
        const balance = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
        return Number(balance.value.uiAmountString ?? balance.value.uiAmount ?? 0);
      };
      const [fuelCurrent, foodCurrent] = await Promise.all([
        balanceForTokenAccount(fuelToken),
        balanceForTokenAccount(foodToken),
      ]);
      const fuelCapacity = Number(chainData.stats?.cargo_stats?.fuel_capacity ?? 0);
      return {
        fleetId,
        fuelCurrent,
        fuelCapacity,
        fuelCurrentPct: fuelCapacity > 0 ? (fuelCurrent / fuelCapacity) * 100 : 0,
        foodCurrent,
        observedAt: Date.now(),
      };
    });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] fleet resource read failed', {
      profileId,
      fleetId,
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ error: 'SEA_FLEET_RESOURCES_UNAVAILABLE' });
  }
});

router.post('/sea/scan/prepare', async (req, res) => {
  const profileInput = req.body?.profileId;
  const fleetInput = req.body?.fleetId;
  const walletInput = req.body?.wallet;
  const coordinates = req.body?.coordinates;
  if (typeof profileInput !== 'string' || typeof fleetInput !== 'string' || typeof walletInput !== 'string' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return res.status(400).json({ error: 'INVALID_SCAN_PREPARE_INPUT' });
  }

  let profileId: string;
  let fleetId: string;
  let walletAddress: PublicKey;
  let x: number;
  let y: number;
  let scanRpc = { name: 'unknown', host: 'unknown' };
  try {
    profileId = new PublicKey(profileInput).toBase58();
    fleetId = new PublicKey(fleetInput).toBase58();
    walletAddress = new PublicKey(walletInput);
    x = Number(coordinates[0]);
    y = Number(coordinates[1]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('INVALID_COORDINATES');
  } catch {
    return res.status(400).json({ error: 'INVALID_SCAN_PREPARE_INPUT' });
  }

  try {
    const snapshot = await getSnapshot(profileId);
    const fleet = snapshot.fleets.find((item: SeaFleet) => item.id === fleetId);
    if (!fleet) return res.status(404).json({ error: 'FLEET_NOT_IN_PROFILE' });
    if (fleet.state !== 'Idle' || !fleet.sector || fleet.sector[0] !== x || fleet.sector[1] !== y) {
      return res.status(409).json({ error: 'FLEET_NOT_AT_SCAN_COORDINATE', fleetState: fleet.state, current: fleet.sector, target: [x, y] });
    }

    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    const sageWallets = allowedWallets
      .filter(key => key.scope === SAGE_PROGRAM_ID.toBase58())
      .map(key => key.pubkey);
    const profileKey = allowedWallets.find(key => key.pubkey === walletAddress.toBase58() && key.scope === SAGE_PROGRAM_ID.toBase58());
    if (!profileKey) {
      return res.status(403).json({
        error: 'WALLET_HAS_NO_SAGE_PROFILE_KEY',
        detail: `Wallet ${walletAddress.toBase58()} non autorizzato per SAGE. Chiavi SAGE del profilo: ${sageWallets.join(', ') || 'nessuna'}`,
      });
    }
    const feePolicy = makePriorityFeePolicy(req.body?.feeMode, req.body?.priorityFeeLamports, 100);

    const chainData = fleet.chainData as any;
    const gameId = new PublicKey(chainData.game_id);
    const cargoHold = new PublicKey(chainData.cargo_hold);
    const profileFactionFilters = [{ memcmp: { offset: 9, bytes: profileId } }];

    const prepared = await withRpc(profileId, async connection => {
      const readOnlyWallet = {
        publicKey: walletAddress,
        signTransaction: async (transaction: any) => transaction,
        signAllTransactions: async (transactions: any[]) => transactions,
      };
      const provider = new AnchorProvider(connection, readOnlyWallet as any, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
      const sageProgram = new Program(sageIdl as any, SAGE_PROGRAM_ID, provider);
      const cargoProgram = new Program(CARGO_IDL as any, CARGO_PROGRAM_ID, provider);
      const game: any = await sageProgram.account.game.fetch(gameId);
      const statsDefinition = game.cargo.statsDefinition;
      const trackers = await sageProgram.account.surveyDataUnitTracker.all();
      const tracker = trackers.find((item: any) => item.account.gameId.equals(gameId));
      if (!tracker) throw new Error('SURVEY_DATA_UNIT_TRACKER_NOT_FOUND');

      const [profileFaction] = await connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
        filters: profileFactionFilters,
        commitment: 'confirmed',
      });
      if (!profileFaction) throw new Error('PROFILE_FACTION_NOT_FOUND');

      const cargoStats: any = await cargoProgram.account.cargoStatsDefinition.fetch(statsDefinition);
      const trackerData = tracker.account as any;
      const cargoSeqId = Number(cargoStats.seqId.toString());
      const [sduCargoType] = CargoType.findAddress(cargoProgram as any, statsDefinition, trackerData.sduMint, cargoSeqId);
      const [resourceCargoType] = CargoType.findAddress(cargoProgram as any, statsDefinition, game.mints.food, cargoSeqId);
      await Promise.all([
        cargoProgram.account.cargoType.fetch(sduCargoType),
        cargoProgram.account.cargoType.fetch(resourceCargoType),
      ]);

      const findPointsCategory = (categoryKey: PublicKey) => Object.values(game.points as any)
        .find((item: any) => item.category.equals(categoryKey));
      const dataRunningPoints = findPointsCategory(DATA_RUNNING_XP_CATEGORY) as any;
      const councilRankPoints = findPointsCategory(COUNCIL_RANK_XP_CATEGORY) as any;
      if (!dataRunningPoints || !councilRankPoints) throw new Error('SCAN_POINTS_CATEGORY_NOT_FOUND');
      const userPointsAddress = (categoryKey: PublicKey) => PublicKey.findProgramAddressSync([
        Buffer.from('UserPointsAccount'), categoryKey.toBuffer(), new PublicKey(profileId).toBuffer(),
      ], POINTS_PROGRAM_ID)[0];
      const progressionConfig = PublicKey.findProgramAddressSync([
        Buffer.from('ProgressionConfig'), gameId.toBuffer(),
      ], SAGE_PROGRAM_ID)[0];
      const trackerSigner = trackerData.signer as PublicKey;
      const sector = PublicKey.findProgramAddressSync([
        Buffer.from('Sector'), gameId.toBuffer(),
        new BN(x).toTwos(64).toArrayLike(Buffer, 'le', 8),
        new BN(y).toTwos(64).toArrayLike(Buffer, 'le', 8),
      ], SAGE_PROGRAM_ID)[0];
      const sduTokenFrom = getAssociatedTokenAddressSync(trackerData.sduMint, trackerSigner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const sduTokenTo = getAssociatedTokenAddressSync(trackerData.sduMint, cargoHold, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const resourceTokenFrom = getAssociatedTokenAddressSync(game.mints.food, cargoHold, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const scanCost = Number(chainData.stats?.misc_stats?.scan_cost ?? 0);
      const trackerSduTokenInfo = await connection.getAccountInfo(sduTokenFrom, 'confirmed');
      if (!trackerSduTokenInfo || !trackerSduTokenInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error('SURVEY_TRACKER_SDU_TOKEN_ACCOUNT_MISSING');
      }
      const scannerTokenAccounts = [
        { address: sduTokenTo, name: 'sduTokenTo' },
        ...(scanCost > 0
          ? [{ address: resourceTokenFrom, name: 'resourceTokenFrom' }]
          : []),
      ];
      const scannerAccountInfos = await connection.getMultipleAccountsInfo(
        scannerTokenAccounts.map(account => account.address),
        'confirmed',
      );
      scannerTokenAccounts.forEach((account, index) => {
        const accountInfo = scannerAccountInfos[index];
        if (accountInfo && !accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
          throw new Error(`INVALID_SCANNER_TOKEN_ACCOUNT_OWNER:${account.name}`);
        }
        if (!accountInfo) throw new Error(`SCANNER_TOKEN_ACCOUNT_MISSING:${account.name}`);
      });
      const sectorInfo = await connection.getAccountInfo(sector, 'confirmed');
      if (!sectorInfo) throw new Error('SCAN_SECTOR_NOT_DISCOVERED');
      if (!sectorInfo.owner.equals(SAGE_PROGRAM_ID)) throw new Error('INVALID_SECTOR_ACCOUNT_OWNER');

      const instructions = [
        ...(feePolicy.instruction ? [feePolicy.instruction] : []),
        await sageProgram.methods.scanForSurveyDataUnits({
        keyIndex: new BN(profileKey.index),
      }).accountsStrict({
        gameAccountsFleetAndOwner: {
          gameFleetAndOwner: {
            fleetAndOwner: {
              fleet: new PublicKey(fleetId),
              owningProfile: new PublicKey(profileId),
              owningProfileFaction: profileFaction.pubkey,
              key: walletAddress,
            },
            gameId,
          },
          gameState: game.gameState,
        },
        surveyDataUnitTracker: tracker.publicKey,
        surveyDataUnitTrackerSigner: trackerSigner,
        cargoHold,
        sector,
        sduTokenFrom,
        sduTokenTo,
        resourceTokenFrom,
        resourceMint: game.mints.food,
        sduCargoType,
        resourceCargoType,
        cargoStatsDefinition: statsDefinition,
        dataRunningXpAccounts: {
          userPointsAccount: userPointsAddress(DATA_RUNNING_XP_CATEGORY),
          pointsCategory: dataRunningPoints.category,
          pointsModifierAccount: dataRunningPoints.modifier,
        },
        councilRankXpAccounts: {
          userPointsAccount: userPointsAddress(COUNCIL_RANK_XP_CATEGORY),
          pointsCategory: councilRankPoints.category,
          pointsModifierAccount: councilRankPoints.modifier,
        },
        progressionConfig,
        pointsProgram: POINTS_PROGRAM_ID,
        cargoProgram: CARGO_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        recentSlothashes: SYSVAR_SLOT_HASHES_PUBKEY,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        }).instruction(),
      ];
      const instructionNames = ['scanForSurveyDataUnits'];

      const latest = await connection.getLatestBlockhash('confirmed');
      const transaction = new VersionedTransaction(new TransactionMessage({
        payerKey: walletAddress,
        recentBlockhash: latest.blockhash,
        instructions,
      }).compileToV0Message());
      const simulation = await connection.simulateTransaction(transaction, {
        commitment: 'confirmed',
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      if (simulation.value.err) {
        console.error('[sea] scan flow simulation rejected', {
          profileId,
          fleetId,
          action: 'scan',
          coordinates: [x, y],
          error: simulation.value.err,
          logs: simulation.value.logs ?? [],
        });
      }
      return {
        action: 'scan' as const,
        fleetId,
        coordinates: [x, y],
        keyIndex: profileKey.index,
        instructions: instructionNames,
        feePolicy: {
          mode: feePolicy.mode,
          baseLamports: feePolicy.baseLamports,
          microLamportsPerCu: feePolicy.microLamportsPerCu,
          estimatedPriorityFeeLamports: feePolicy.estimatedPriorityFeeLamports,
        },
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        transactionObject: transaction,
        sduTokenAccount: sduTokenTo.toBase58(),
        sduMint: trackerData.sduMint.toBase58(),
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        simulation: {
          err: simulation.value.err,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? null,
        },
      };
    }, endpoint => { scanRpc = seaRpc(endpoint); });
    let prepareId: string | null = null;
    if (!prepared.simulation.err) {
      const now = Date.now();
      await pruneScanPreparations(now);
      prepareId = randomUUID();
      await storeScanPreparation(prepareId, {
        action: prepared.action,
        profileId,
        fleetId,
        wallet: walletAddress.toBase58(),
        transaction: prepared.transactionObject,
        sduTokenAccount: prepared.sduTokenAccount,
        sduMint: prepared.sduMint,
        feePolicy: prepared.feePolicy,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        expiresAt: now + 90_000,
      });
      console.info('[sea] transaction prepared', { pid: process.pid, action: prepared.action, prepareId });
    }
    return res.json({
      fleetId: prepared.fleetId,
      coordinates: prepared.coordinates,
      keyIndex: prepared.keyIndex,
      instructions: prepared.instructions,
      feePolicy: prepared.feePolicy,
      transaction: prepared.transaction,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      simulation: prepared.simulation,
      prepareId,
      action: prepared.action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] scan preparation failed', {
      profileId,
      fleetId,
      wallet: walletAddress.toBase58(),
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
      stack: error instanceof Error ? error.stack?.replace(/https?:\/\/\S+/g, '<rpc-url>') : undefined,
      rpc: scanRpc,
    });
    return res.status(503).json({ error: 'SEA_SCAN_PREPARATION_FAILED', detail: message.split(':')[0] });
  }
});

router.post('/sea/subwarp/prepare', async (req, res) => {
  const profileInput = req.body?.profileId;
  const fleetInput = req.body?.fleetId;
  const walletInput = req.body?.wallet;
  const coordinates = req.body?.coordinates;
  const starbaseInput = typeof req.body?.starbase === 'string' ? req.body.starbase : '';
  if (typeof profileInput !== 'string' || typeof fleetInput !== 'string' || typeof walletInput !== 'string' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return res.status(400).json({ error: 'INVALID_SUBWARP_PREPARE_INPUT' });
  }

  let profileId: string;
  let fleetId: string;
  let walletAddress: PublicKey;
  let x: number;
  let y: number;
  try {
    profileId = new PublicKey(profileInput).toBase58();
    fleetId = new PublicKey(fleetInput).toBase58();
    walletAddress = new PublicKey(walletInput);
    x = Number(coordinates[0]);
    y = Number(coordinates[1]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('INVALID_COORDINATES');
  } catch {
    return res.status(400).json({ error: 'INVALID_SUBWARP_PREPARE_INPUT' });
  }

  try {
    const snapshot = await getSnapshot(profileId);
    const fleet = snapshot.fleets.find((item: SeaFleet) => item.id === fleetId);
    if (!fleet) return res.status(404).json({ error: 'FLEET_NOT_IN_PROFILE' });
    if (fleet.state !== 'Idle' || !fleet.sector) {
      return res.status(409).json({ error: 'FLEET_NOT_IDLE_FOR_SUBWARP', fleetState: fleet.state, current: fleet.sector });
    }

    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    const profileKey = allowedWallets.find(key => key.pubkey === walletAddress.toBase58() && key.scope === SAGE_PROGRAM_ID.toBase58());
    if (!profileKey) return res.status(403).json({ error: 'WALLET_HAS_NO_SAGE_PROFILE_KEY' });
    const feePolicy = makePriorityFeePolicy(req.body?.feeMode, req.body?.priorityFeeLamports, 10);

    const starbases = starbaseInput.split(';').map(value => value.trim()).filter(Boolean).map(value => {
      const [baseX, baseY] = value.split(',').map(Number);
      if (!Number.isSafeInteger(baseX) || !Number.isSafeInteger(baseY)) throw new Error('INVALID_STARBASE_COORDINATES');
      return [baseX, baseY] as [number, number];
    });
    if (!starbases.length) return res.status(400).json({ error: 'STARBASE_REQUIRED_FOR_FUEL_GUARD' });
    const target = [x, y] as [number, number];
    const nearestStarbase = [...starbases].sort((left, right) =>
      Math.hypot(target[0] - left[0], target[1] - left[1]) - Math.hypot(target[0] - right[0], target[1] - right[1])
    )[0];

    const chainData = fleet.chainData as any;
    const gameId = new PublicKey(chainData.game_id);
    const fuelTank = new PublicKey(chainData.fuel_tank);
    const distanceOutbound = Math.hypot(x - fleet.sector[0], y - fleet.sector[1]);
    const distanceReturn = Math.hypot(nearestStarbase[0] - x, nearestStarbase[1] - y);
    const subwarpSpeed = Number(chainData.stats?.movement_stats?.subwarp_speed ?? 0);
    const fuelRate = Number(chainData.stats?.movement_stats?.subwarp_fuel_consumption_rate ?? 0);
    if (!(subwarpSpeed > 0) || !(fuelRate >= 0)) throw new Error('INVALID_SUBWARP_STATS');
    const fuelRequiredRoundTrip = (distanceOutbound + distanceReturn) * (fuelRate / 100);

    const prepared = await withRpc(profileId, async connection => {
      const decodedGame = await coder.accounts.decode('Game', (await connection.getAccountInfo(gameId, 'confirmed'))!.data) as any;
      const fuelToken = getAssociatedTokenAddressSync(decodedGame.mints.fuel, fuelTank, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const fuelInfo = await connection.getAccountInfo(fuelToken, 'confirmed');
      if (!fuelInfo || !fuelInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('FLEET_FUEL_ACCOUNT_NOT_FOUND');
      const fuelBalance = await connection.getTokenAccountBalance(fuelToken, 'confirmed');
      const fuelCurrent = Number(fuelBalance.value.uiAmountString ?? fuelBalance.value.uiAmount ?? 0);
      if (!(fuelCurrent > fuelRequiredRoundTrip)) {
        throw new Error(`SUBWARP_FUEL_INSUFFICIENT:${fuelCurrent.toFixed(2)}:${fuelRequiredRoundTrip.toFixed(2)}`);
      }

      const [profileFaction] = await connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 9, bytes: profileId } }],
        commitment: 'confirmed',
      });
      if (!profileFaction) throw new Error('PROFILE_FACTION_NOT_FOUND');
      const sageProgram = new Program(sageIdl as any, SAGE_PROGRAM_ID, new AnchorProvider(connection, {
        publicKey: walletAddress,
        signTransaction: async (transaction: any) => transaction,
        signAllTransactions: async (transactions: any[]) => transactions,
      } as any, { commitment: 'confirmed', preflightCommitment: 'confirmed' }));
      const game = await sageProgram.account.game.fetch(gameId) as any;
      const instruction = await sageProgram.methods.startSubwarp({
        keyIndex: new BN(profileKey.index),
        toSector: [new BN(x), new BN(y)],
      }).accountsStrict({
        gameAccountsFleetAndOwner: {
          gameFleetAndOwner: {
            fleetAndOwner: {
              fleet: new PublicKey(fleetId),
              owningProfile: new PublicKey(profileId),
              owningProfileFaction: profileFaction.pubkey,
              key: walletAddress,
            },
            gameId,
          },
          gameState: game.gameState,
        },
      }).instruction();
      const latest = await connection.getLatestBlockhash('confirmed');
      const transaction = new VersionedTransaction(new TransactionMessage({
        payerKey: walletAddress,
        recentBlockhash: latest.blockhash,
        instructions: [...(feePolicy.instruction ? [feePolicy.instruction] : []), instruction],
      }).compileToV0Message());
      const simulation = await connection.simulateTransaction(transaction, {
        commitment: 'confirmed',
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      return {
        fleetId,
        coordinates: target,
        starbase: nearestStarbase,
        distanceOutbound,
        distanceReturn,
        fuelCurrent,
        fuelRequiredRoundTrip,
        arrivalSeconds: distanceOutbound / (subwarpSpeed / 1_000_000),
        feePolicy: {
          mode: feePolicy.mode,
          baseLamports: feePolicy.baseLamports,
          microLamportsPerCu: feePolicy.microLamportsPerCu,
          estimatedPriorityFeeLamports: feePolicy.estimatedPriorityFeeLamports,
        },
        instructions: ['startSubwarp'],
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        transactionObject: transaction,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        simulation: {
          err: simulation.value.err,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? null,
        },
      };
    });
    let prepareId: string | null = null;
    if (!prepared.simulation.err) {
      const now = Date.now();
      await pruneScanPreparations(now);
      prepareId = randomUUID();
      await storeScanPreparation(prepareId, {
        action: 'subwarp_start',
        profileId,
        fleetId,
        wallet: walletAddress.toBase58(),
        transaction: prepared.transactionObject,
        feePolicy: prepared.feePolicy,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        expiresAt: now + 90_000,
      });
      console.info('[sea] transaction prepared', { pid: process.pid, action: 'subwarp_start', prepareId });
    }
    return res.json({
      fleetId: prepared.fleetId,
      coordinates: prepared.coordinates,
      starbase: prepared.starbase,
      distanceOutbound: prepared.distanceOutbound,
      distanceReturn: prepared.distanceReturn,
      fuelCurrent: prepared.fuelCurrent,
      fuelRequiredRoundTrip: prepared.fuelRequiredRoundTrip,
      arrivalSeconds: prepared.arrivalSeconds,
      feePolicy: prepared.feePolicy,
      instructions: prepared.instructions,
      transaction: prepared.transaction,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      simulation: prepared.simulation,
      prepareId,
      action: 'subwarp_start',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] subwarp preparation failed', {
      profileId,
      fleetId,
      wallet: walletAddress.toBase58(),
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ error: 'SEA_SUBWARP_PREPARATION_FAILED', detail: message.split(':')[0] });
  }
});

router.post('/sea/warp/prepare', async (req, res) => {
  const profileInput = req.body?.profileId;
  const fleetInput = req.body?.fleetId;
  const walletInput = req.body?.wallet;
  const coordinates = req.body?.coordinates;
  const starbaseInput = typeof req.body?.starbase === 'string' ? req.body.starbase : '';
  if (typeof profileInput !== 'string' || typeof fleetInput !== 'string' || typeof walletInput !== 'string' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return res.status(400).json({ error: 'INVALID_WARP_PREPARE_INPUT' });
  }

  let profileId: string;
  let fleetId: string;
  let walletAddress: PublicKey;
  let x: number;
  let y: number;
  try {
    profileId = new PublicKey(profileInput).toBase58();
    fleetId = new PublicKey(fleetInput).toBase58();
    walletAddress = new PublicKey(walletInput);
    x = Number(coordinates[0]);
    y = Number(coordinates[1]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('INVALID_COORDINATES');
  } catch {
    return res.status(400).json({ error: 'INVALID_WARP_PREPARE_INPUT' });
  }

  try {
    const snapshot = await getSnapshot(profileId);
    const fleet = snapshot.fleets.find((item: SeaFleet) => item.id === fleetId);
    if (!fleet) return res.status(404).json({ error: 'FLEET_NOT_IN_PROFILE' });
    if (fleet.state !== 'Idle' || !fleet.sector) {
      return res.status(409).json({ error: 'FLEET_NOT_IDLE_FOR_WARP', fleetState: fleet.state, current: fleet.sector });
    }

    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    const profileKey = allowedWallets.find(key => key.pubkey === walletAddress.toBase58() && key.scope === SAGE_PROGRAM_ID.toBase58());
    if (!profileKey) return res.status(403).json({ error: 'WALLET_HAS_NO_SAGE_PROFILE_KEY' });
    const feePolicy = makePriorityFeePolicy(req.body?.feeMode, req.body?.priorityFeeLamports, 100);

    const starbases = starbaseInput.split(';').map(value => value.trim()).filter(Boolean).map(value => {
      const [baseX, baseY] = value.split(',').map(Number);
      if (!Number.isSafeInteger(baseX) || !Number.isSafeInteger(baseY)) throw new Error('INVALID_STARBASE_COORDINATES');
      return [baseX, baseY] as [number, number];
    });
    if (!starbases.length) return res.status(400).json({ error: 'STARBASE_REQUIRED_FOR_FUEL_GUARD' });

    const chainData = fleet.chainData as any;
    const gameId = new PublicKey(chainData.game_id);
    const fuelTank = new PublicKey(chainData.fuel_tank);
    const stats = chainData.stats?.movement_stats ?? {};
    const warpSpeed = Number(stats.warp_speed ?? 0);
    const maxWarpDistance = Number(stats.max_warp_distance ?? 0);
    const warpFuelRate = Number(stats.warp_fuel_consumption_rate ?? 0);
    if (!(warpSpeed > 0) || !(maxWarpDistance > 0) || !(warpFuelRate >= 0)) throw new Error('INVALID_WARP_STATS');
    const current: [number, number] = [fleet.sector[0], fleet.sector[1]];
    const target: [number, number] = [x, y];
    const waypoint = nextWarpWaypoint(maxWarpDistance, current, target);
    const nearestStarbase = [...starbases].sort((left, right) =>
      Math.hypot(target[0] - left[0], target[1] - left[1]) - Math.hypot(target[0] - right[0], target[1] - right[1])
    )[0];
    const fuelRequiredRoundTrip = warpFuelRequired(current, target, maxWarpDistance, warpFuelRate)
      + warpFuelRequired(target, nearestStarbase, maxWarpDistance, warpFuelRate);
    const warpCooldownExpiresAt = Number(chainData.warp_cooldown_expires_at ?? 0) * 1000;
    if (warpCooldownExpiresAt > Date.now()) {
      return res.status(409).json({ error: 'WARP_COOLDOWN_ACTIVE', expiresAt: warpCooldownExpiresAt });
    }

    const prepared = await withRpc(profileId, async connection => {
      const readOnlyWallet = {
        publicKey: walletAddress,
        signTransaction: async (transaction: any) => transaction,
        signAllTransactions: async (transactions: any[]) => transactions,
      };
      const provider = new AnchorProvider(connection, readOnlyWallet as any, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
      const sageProgram = new Program(sageIdl as any, SAGE_PROGRAM_ID, provider);
      const cargoProgram = new Program(CARGO_IDL as any, CARGO_PROGRAM_ID, provider);
      const game: any = await sageProgram.account.game.fetch(gameId);
      const statsDefinition = game.cargo.statsDefinition;
      const cargoStats: any = await cargoProgram.account.cargoStatsDefinition.fetch(statsDefinition);
      const [fuelCargoType] = CargoType.findAddress(
        cargoProgram as any,
        statsDefinition,
        game.mints.fuel,
        Number(cargoStats.seqId.toString()),
      );
      await cargoProgram.account.cargoType.fetch(fuelCargoType);
      const fuelToken = getAssociatedTokenAddressSync(game.mints.fuel, fuelTank, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const fuelInfo = await connection.getAccountInfo(fuelToken, 'confirmed');
      if (!fuelInfo || !fuelInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new Error('FLEET_FUEL_ACCOUNT_NOT_FOUND');
      const fuelBalance = await connection.getTokenAccountBalance(fuelToken, 'confirmed');
      const fuelCurrent = Number(fuelBalance.value.uiAmountString ?? fuelBalance.value.uiAmount ?? 0);
      if (fuelCurrent < fuelRequiredRoundTrip) {
        throw new Error(`WARP_FUEL_INSUFFICIENT:${fuelCurrent.toFixed(2)}:${fuelRequiredRoundTrip.toFixed(2)}`);
      }
      const [profileFaction] = await connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 9, bytes: profileId } }],
        commitment: 'confirmed',
      });
      if (!profileFaction) throw new Error('PROFILE_FACTION_NOT_FOUND');
      const instruction = await sageProgram.methods.warpToCoordinate({
        keyIndex: new BN(profileKey.index),
        toSector: [new BN(waypoint[0]), new BN(waypoint[1])],
      }).accountsStrict({
        gameAccountsFleetAndOwner: {
          gameFleetAndOwner: {
            fleetAndOwner: {
              fleet: new PublicKey(fleetId),
              owningProfile: new PublicKey(profileId),
              owningProfileFaction: profileFaction.pubkey,
              key: walletAddress,
            },
            gameId,
          },
          gameState: game.gameState,
        },
        fuelTank,
        cargoType: fuelCargoType,
        statsDefinition,
        tokenFrom: fuelToken,
        tokenMint: game.mints.fuel,
        cargoProgram: CARGO_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).instruction();
      const latest = await connection.getLatestBlockhash('confirmed');
      const transaction = new VersionedTransaction(new TransactionMessage({
        payerKey: walletAddress,
        recentBlockhash: latest.blockhash,
        instructions: [...(feePolicy.instruction ? [feePolicy.instruction] : []), instruction],
      }).compileToV0Message());
      const simulation = await connection.simulateTransaction(transaction, {
        commitment: 'confirmed',
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      return {
        fuelCurrent,
        transaction,
        transactionBase64: Buffer.from(transaction.serialize()).toString('base64'),
        feePolicy: {
          mode: feePolicy.mode,
          baseLamports: feePolicy.baseLamports,
          microLamportsPerCu: feePolicy.microLamportsPerCu,
          estimatedPriorityFeeLamports: feePolicy.estimatedPriorityFeeLamports,
        },
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        simulation: { err: simulation.value.err, logs: simulation.value.logs ?? [], unitsConsumed: simulation.value.unitsConsumed ?? null },
      };
    });

    let prepareId: string | null = null;
    if (!prepared.simulation.err) {
      const now = Date.now();
      await pruneScanPreparations(now);
      prepareId = randomUUID();
      await storeScanPreparation(prepareId, {
        action: 'warp_start', profileId, fleetId, wallet: walletAddress.toBase58(), transaction: prepared.transaction,
        feePolicy: prepared.feePolicy,
        blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight, expiresAt: now + 90_000,
      });
      console.info('[sea] transaction prepared', { pid: process.pid, action: 'warp_start', prepareId });
    }
    const distance = Math.hypot(waypoint[0] - current[0], waypoint[1] - current[1]);
    return res.json({
      fleetId, coordinates: waypoint, finalCoordinates: target, fuelCurrent: prepared.fuelCurrent, fuelRequiredRoundTrip,
      arrivalSeconds: distance / (warpSpeed / 1_000_000), feePolicy: prepared.feePolicy, instructions: ['warpToCoordinate'],
      transaction: prepared.transactionBase64, lastValidBlockHeight: prepared.lastValidBlockHeight,
      simulation: prepared.simulation, prepareId, action: 'warp_start',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] warp preparation failed', {
      profileId, fleetId, wallet: walletAddress.toBase58(), error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ error: 'SEA_WARP_PREPARATION_FAILED', detail: message.split(':')[0] });
  }
});

router.post('/sea/movement/exit/prepare', async (req, res) => {
  const profileInput = req.body?.profileId;
  const fleetInput = req.body?.fleetId;
  const walletInput = req.body?.wallet;
  const coordinates = req.body?.coordinates;
  if (typeof profileInput !== 'string' || typeof fleetInput !== 'string' || typeof walletInput !== 'string' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return res.status(400).json({ error: 'INVALID_MOVEMENT_EXIT_INPUT' });
  }

  let profileId: string;
  let fleetId: string;
  let walletAddress: PublicKey;
  let x: number;
  let y: number;
  try {
    profileId = new PublicKey(profileInput).toBase58();
    fleetId = new PublicKey(fleetInput).toBase58();
    walletAddress = new PublicKey(walletInput);
    x = Number(coordinates[0]);
    y = Number(coordinates[1]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('INVALID_COORDINATES');
  } catch {
    return res.status(400).json({ error: 'INVALID_MOVEMENT_EXIT_INPUT' });
  }

  let prepareRpc = { name: 'unknown', host: 'unknown' };
  try {
    const snapshot = await getSnapshot(profileId);
    const fleet = snapshot.fleets.find((item: SeaFleet) => item.id === fleetId);
    if (!fleet) return res.status(404).json({ error: 'FLEET_NOT_IN_PROFILE' });
    if (fleet.state !== 'MoveSubwarp' && fleet.state !== 'MoveWarp') return res.status(409).json({ error: 'FLEET_NOT_IN_MOVEMENT', fleetState: fleet.state });
    if (fleet.arrival > Date.now()) return res.status(409).json({ error: 'MOVEMENT_STILL_IN_PROGRESS', arrival: fleet.arrival });
    const exitAction = fleet.state === 'MoveWarp' ? 'warp_exit' : 'subwarp_exit';
    const feePolicy = makePriorityFeePolicy(req.body?.feeMode, req.body?.priorityFeeLamports, exitAction === 'subwarp_exit' ? 100 : 10);
    if (!fleet.to || fleet.to[0] !== x || fleet.to[1] !== y) {
      return res.status(409).json({ error: 'SUBWARP_TARGET_MISMATCH', fleetTarget: fleet.to, requestedTarget: [x, y] });
    }

    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    const profileKey = allowedWallets.find(key => key.pubkey === walletAddress.toBase58() && key.scope === SAGE_PROGRAM_ID.toBase58());
    if (!profileKey) return res.status(403).json({ error: 'WALLET_HAS_NO_SAGE_PROFILE_KEY' });

    const chainData = fleet.chainData as any;
    const gameId = new PublicKey(chainData.game_id);
    const fuelTank = new PublicKey(chainData.fuel_tank);
    const prepared = await withRpc(profileId, async connection => {
      const readOnlyWallet = {
        publicKey: walletAddress,
        signTransaction: async (transaction: any) => transaction,
        signAllTransactions: async (transactions: any[]) => transactions,
      };
      const provider = new AnchorProvider(connection, readOnlyWallet as any, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
      const sageProgram = new Program(sageIdl as any, SAGE_PROGRAM_ID, provider);
      const cargoProgram = new Program(CARGO_IDL as any, CARGO_PROGRAM_ID, provider);
      const game: any = await sageProgram.account.game.fetch(gameId);
      const statsDefinition = game.cargo.statsDefinition;
      const cargoStats: any = await cargoProgram.account.cargoStatsDefinition.fetch(statsDefinition);
      const [fuelCargoType] = CargoType.findAddress(
        cargoProgram as any,
        statsDefinition,
        game.mints.fuel,
        Number(cargoStats.seqId.toString()),
      );
      await cargoProgram.account.cargoType.fetch(fuelCargoType);
      const fuelToken = getAssociatedTokenAddressSync(game.mints.fuel, fuelTank, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const findPointsCategory = (categoryKey: PublicKey) => Object.values(game.points as any)
        .find((item: any) => item.category.equals(categoryKey));
      const pilotingPoints = findPointsCategory(PILOTING_XP_CATEGORY) as any;
      const councilRankPoints = findPointsCategory(COUNCIL_RANK_XP_CATEGORY) as any;
      if (!pilotingPoints || !councilRankPoints) throw new Error('MOVEMENT_POINTS_CATEGORY_NOT_FOUND');
      const userPointsAddress = (categoryKey: PublicKey) => PublicKey.findProgramAddressSync([
        Buffer.from('UserPointsAccount'), categoryKey.toBuffer(), new PublicKey(profileId).toBuffer(),
      ], POINTS_PROGRAM_ID)[0];
      const progressionConfig = PublicKey.findProgramAddressSync([
        Buffer.from('ProgressionConfig'), gameId.toBuffer(),
      ], SAGE_PROGRAM_ID)[0];
      const remainingAccounts = fleet.state === 'MoveWarp' ? [
        { pubkey: userPointsAddress(PILOTING_XP_CATEGORY), isSigner: false, isWritable: true },
        { pubkey: pilotingPoints.category, isSigner: false, isWritable: false },
        { pubkey: pilotingPoints.modifier, isSigner: false, isWritable: false },
        { pubkey: userPointsAddress(COUNCIL_RANK_XP_CATEGORY), isSigner: false, isWritable: true },
        { pubkey: councilRankPoints.category, isSigner: false, isWritable: false },
        { pubkey: councilRankPoints.modifier, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(profileId), isSigner: false, isWritable: false },
        { pubkey: progressionConfig, isSigner: false, isWritable: false },
        { pubkey: gameId, isSigner: false, isWritable: false },
        { pubkey: POINTS_PROGRAM_ID, isSigner: false, isWritable: false },
      ] : [
        { pubkey: new PublicKey(profileId), isSigner: false, isWritable: true },
        { pubkey: fuelTank, isSigner: false, isWritable: true },
        { pubkey: fuelCargoType, isSigner: false, isWritable: false },
        { pubkey: statsDefinition, isSigner: false, isWritable: false },
        { pubkey: fuelToken, isSigner: false, isWritable: true },
        { pubkey: game.mints.fuel, isSigner: false, isWritable: true },
        { pubkey: userPointsAddress(PILOTING_XP_CATEGORY), isSigner: false, isWritable: true },
        { pubkey: pilotingPoints.category, isSigner: false, isWritable: false },
        { pubkey: pilotingPoints.modifier, isSigner: false, isWritable: false },
        { pubkey: userPointsAddress(COUNCIL_RANK_XP_CATEGORY), isSigner: false, isWritable: true },
        { pubkey: councilRankPoints.category, isSigner: false, isWritable: false },
        { pubkey: councilRankPoints.modifier, isSigner: false, isWritable: false },
        { pubkey: progressionConfig, isSigner: false, isWritable: false },
        { pubkey: gameId, isSigner: false, isWritable: false },
        { pubkey: POINTS_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: CARGO_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ];
      const instruction = await sageProgram.methods.fleetStateHandler()
        .accountsStrict({ fleet: new PublicKey(fleetId) })
        .remainingAccounts(remainingAccounts)
        .instruction();
      const latest = await connection.getLatestBlockhash('confirmed');
      const transaction = new VersionedTransaction(new TransactionMessage({
        payerKey: walletAddress,
        recentBlockhash: latest.blockhash,
        instructions: [...(feePolicy.instruction ? [feePolicy.instruction] : []), instruction],
      }).compileToV0Message());
      const simulation = await connection.simulateTransaction(transaction, {
        commitment: 'confirmed',
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      return {
        fleetId,
        instructions: [exitAction === 'warp_exit' ? 'fleetStateHandler:exitWarp' : 'fleetStateHandler:exitSubwarp'],
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        transactionObject: transaction,
        feePolicy: {
          mode: feePolicy.mode,
          baseLamports: feePolicy.baseLamports,
          microLamportsPerCu: feePolicy.microLamportsPerCu,
          estimatedPriorityFeeLamports: feePolicy.estimatedPriorityFeeLamports,
        },
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        simulation: {
          err: simulation.value.err,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? null,
        },
      };
    }, endpoint => { prepareRpc = seaRpc(endpoint); });
    let prepareId: string | null = null;
    if (!prepared.simulation.err) {
      const now = Date.now();
      await pruneScanPreparations(now);
      prepareId = randomUUID();
      await storeScanPreparation(prepareId, {
        action: exitAction,
        profileId,
        fleetId,
        wallet: walletAddress.toBase58(),
        transaction: prepared.transactionObject,
        feePolicy: prepared.feePolicy,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
        expiresAt: now + 90_000,
      });
      console.info('[sea] transaction prepared', {
        pid: process.pid,
        action: exitAction,
        prepareId,
        rpc: prepareRpc,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight,
      });
    }
    return res.json({
      fleetId,
      instructions: prepared.instructions,
      transaction: prepared.transaction,
      feePolicy: prepared.feePolicy,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      simulation: prepared.simulation,
      prepareId,
      action: exitAction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] subwarp exit preparation failed', {
      profileId,
      fleetId,
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ error: 'SEA_SUBWARP_EXIT_PREPARATION_FAILED', detail: message.split(':')[0] });
  }
});

router.post('/sea/scan/submit', async (req, res) => {
  const prepareId = typeof req.body?.prepareId === 'string' ? req.body.prepareId : '';
  const profileInput = typeof req.body?.profileId === 'string' ? req.body.profileId : '';
  const walletInput = typeof req.body?.wallet === 'string' ? req.body.wallet : '';
  const transactionInput = typeof req.body?.transaction === 'string' ? req.body.transaction : '';
  let preparation: ScanPreparation | undefined;
  try {
    preparation = await getScanPreparation(prepareId);
  } catch (error) {
    console.error('[sea] failed to load stored preparation', { pid: process.pid, prepareId, error: String(error) });
    return res.status(503).json({ error: 'SCAN_PREPARATION_STORE_UNAVAILABLE' });
  }
  if (!preparation) {
    console.warn('[sea] transaction preparation not found', { pid: process.pid, prepareId });
    return res.status(410).json({ error: 'SCAN_PREPARATION_NOT_FOUND' });
  }
  if (preparation.expiresAt <= Date.now()) {
    console.warn('[sea] transaction preparation expired', {
      pid: process.pid,
      action: preparation.action,
      prepareId,
      expiredByMs: Date.now() - preparation.expiresAt,
    });
    await deleteScanPreparation(prepareId);
    return res.status(410).json({ error: 'SCAN_PREPARATION_EXPIRED' });
  }

  let profileId: string;
  let walletAddress: PublicKey;
  let signedTransaction: VersionedTransaction;
  try {
    profileId = new PublicKey(profileInput).toBase58();
    walletAddress = new PublicKey(walletInput);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(transactionInput) || transactionInput.length > 20_000) throw new Error('INVALID_SIGNED_TRANSACTION');
    signedTransaction = VersionedTransaction.deserialize(Buffer.from(transactionInput, 'base64'));
  } catch {
    return res.status(400).json({ error: 'INVALID_SCAN_SUBMIT_INPUT' });
  }

  if (profileId !== preparation.profileId || walletAddress.toBase58() !== preparation.wallet) {
    return res.status(403).json({ error: 'SCAN_PREPARATION_CONTEXT_MISMATCH' });
  }
  if (!signedTransaction.message.staticAccountKeys[0]?.equals(walletAddress)) {
    return res.status(403).json({ error: 'SCAN_FEE_PAYER_MISMATCH' });
  }
  const preparedMessage = Buffer.from(preparation.transaction.message.serialize());
  const signedMessage = Buffer.from(signedTransaction.message.serialize());
  const requiredSignatures = signedTransaction.message.header.numRequiredSignatures;
  const signatureValidity = signedTransaction.signatures.slice(0, requiredSignatures).map((signature, index) =>
    signature.some(byte => byte !== 0) && nacl.sign.detached.verify(
      signedMessage,
      signature,
      signedTransaction.message.staticAccountKeys[index].toBytes(),
    )
  );
  const messageMatches = preparedMessage.equals(signedMessage);
  const signaturesValid = signatureValidity.length === requiredSignatures && signatureValidity.every(Boolean);
  const messageValidation = validateWalletTransactionMessage(preparation.transaction, signedTransaction, preparation.feePolicy);
  if (!signaturesValid || !messageValidation.valid) {
    console.warn('[sea] signed transaction validation failed', {
      pid: process.pid,
      action: preparation.action,
      prepareId,
      messageMatches,
      messageValidation,
      requiredSignatures,
      signatureCount: signedTransaction.signatures.length,
      validSignatures: signatureValidity.filter(Boolean).length,
    });
    return res.status(403).json({ error: 'SCAN_SIGNATURE_OR_MESSAGE_INVALID', detail: messageValidation.reason });
  }
  if (!messageMatches) {
    console.info('[sea] accepted wallet compute-budget normalization', {
      pid: process.pid,
      action: preparation.action,
      prepareId,
      computeUnitLimit: messageValidation.computeUnitLimit,
      microLamportsPerCu: messageValidation.microLamportsPerCu,
    });
  }

  const { allowedWallets } = await getWalletAuthorityUtil(profileId);
  const sageWallets = allowedWallets
    .filter(key => key.scope === SAGE_PROGRAM_ID.toBase58())
    .map(key => key.pubkey);
  const authorized = sageWallets.includes(walletAddress.toBase58());
  if (!authorized) {
    return res.status(403).json({
      error: 'WALLET_HAS_NO_SAGE_PROFILE_KEY',
      detail: `Wallet ${walletAddress.toBase58()} non autorizzato per SAGE. Chiavi SAGE del profilo: ${sageWallets.join(', ') || 'nessuna'}`,
    });
  }

  await deleteScanPreparation(prepareId);
  let submitRpc = { name: 'unknown', host: 'unknown' };
  try {
    const result = await withRpc(profileId, async connection => {
      console.info('[sea] submitting signed transaction', {
        pid: process.pid,
        action: preparation.action,
        prepareId,
        rpc: submitRpc,
        lastValidBlockHeight: preparation.lastValidBlockHeight,
      });
      let signature: string;
      try {
        signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          maxRetries: 3,
          preflightCommitment: 'confirmed',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        if (/blockhash (not found|expired)|block height exceeded/i.test(message)) {
          console.warn('[sea] RPC preflight rejected expired blockhash', { pid: process.pid, action: preparation.action, prepareId, rpc: submitRpc });
          throw new Error('SCAN_TRANSACTION_BLOCKHASH_EXPIRED');
        }
        throw error;
      }
      let confirmationStatus = 'confirmed';
      let scanResult: Record<string, unknown> | null = null;
      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: preparation.blockhash,
          lastValidBlockHeight: preparation.lastValidBlockHeight,
        }, 'confirmed');
        if (confirmation.value.err) throw new Error(`SCAN_TRANSACTION_FAILED:${JSON.stringify(confirmation.value.err)}`);
        confirmationStatus = confirmation.value.confirmationStatus ?? 'confirmed';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        if (!/block height exceeded|signature has expired/i.test(message)) throw error;
        const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
        if (!status) throw new Error(`SCAN_CONFIRMATION_UNKNOWN:${signature}`);
        if (status.err) throw new Error(`SCAN_TRANSACTION_FAILED:${JSON.stringify(status.err)}`);
        const isConfirmed = status.confirmationStatus === 'confirmed'
          || status.confirmationStatus === 'finalized'
          || status.confirmations === null
          || (status.confirmations ?? 0) > 0;
        if (!isConfirmed) {
          throw new Error(`SCAN_CONFIRMATION_PENDING:${signature}`);
        }
        confirmationStatus = status.confirmationStatus ?? (status.confirmations === null ? 'finalized' : 'confirmed');
      }
      let networkFeeLamports: number | null = null;
      try {
        const transactionInfo: any = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (!transactionInfo?.meta) throw new Error('TRANSACTION_METADATA_UNAVAILABLE');
        networkFeeLamports = Number(transactionInfo.meta.fee);
        if (preparation.action === 'scan') {
          const accountKeys: PublicKey[] = transactionInfo.transaction.message.staticAccountKeys
            ?? transactionInfo.transaction.message.accountKeys;
          const sduAccountIndex = accountKeys.findIndex(key => key.toBase58() === preparation.sduTokenAccount);
          if (sduAccountIndex < 0) throw new Error('SCAN_SDU_ACCOUNT_NOT_IN_TRANSACTION');
          const findTokenBalance = (balances: any[] | null) => balances?.find(balance =>
            balance.accountIndex === sduAccountIndex && balance.mint === preparation.sduMint
          );
          const preBalance = findTokenBalance(transactionInfo.meta.preTokenBalances);
          const postBalance = findTokenBalance(transactionInfo.meta.postTokenBalances);
          const decimals = postBalance?.uiTokenAmount?.decimals ?? preBalance?.uiTokenAmount?.decimals ?? 0;
          const preAmount = BigInt(preBalance?.uiTokenAmount?.amount ?? '0');
          const postAmount = BigInt(postBalance?.uiTokenAmount?.amount ?? '0');
          const probabilityLog = (transactionInfo.meta.logMessages ?? []).find((line: string) =>
            line.startsWith('Program log: SDU probability:')
          );
          const probabilityMatch = probabilityLog?.match(/SDU probability:\s*([\d.]+)/);
          scanResult = {
            sduFound: Number(postAmount - preAmount) / (10 ** decimals),
            sduBalanceBefore: Number(preAmount) / (10 ** decimals),
            sduBalanceAfter: Number(postAmount) / (10 ** decimals),
            probabilityPct: probabilityMatch ? Number(probabilityMatch[1]) * 100 : null,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        console.warn('[sea] transaction fee/result metadata unavailable', {
          profileId,
          fleetId: preparation.fleetId,
          signature,
          error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
        });
      }
      const fee = {
        mode: preparation.feePolicy?.mode ?? 'wallet',
        baseLamports: preparation.feePolicy?.baseLamports ?? null,
        microLamportsPerCu: preparation.feePolicy?.microLamportsPerCu ?? null,
        estimatedPriorityFeeLamports: preparation.feePolicy?.estimatedPriorityFeeLamports ?? null,
        networkFeeLamports,
        networkFeeSol: networkFeeLamports === null ? null : networkFeeLamports / 1_000_000_000,
      };
      console.info('[sea] network fee charged', { profileId, fleetId: preparation.fleetId, signature, ...fee });
      return { signature, action: preparation.action, confirmationStatus, fee, scanResult };
    }, endpoint => { submitRpc = seaRpc(endpoint); });
    console.info('[sea] scan transaction confirmed', { profileId, fleetId: preparation.fleetId, signature: result.signature });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    console.error('[sea] scan transaction submit failed', {
      profileId,
      fleetId: preparation.fleetId,
      error: message.replace(/https?:\/\/\S+/g, '<rpc-url>'),
    });
    return res.status(503).json({ error: 'SEA_SCAN_SUBMIT_FAILED', detail: message.split(':')[0] });
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