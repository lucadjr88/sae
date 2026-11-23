import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { createRequire } from 'node:module';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';
import { getRentalRpcErrorType } from './rentalRpc.js';

const require = createRequire(import.meta.url);
const { createContract, deriveContract, deriveRentalAuthority, setSdkConfig } = require('@sly-rentals/core/legacy') as typeof import('@sly-rentals/core/legacy');

export interface ListFleetTxParams {
  owner: string | PublicKey;
  ownerProfile: string | PublicKey;
  fleet: string | PublicKey;
  rate: number | string;
  durationMin?: number | string;
  durationMax?: number | string;
  paymentFrequency?: string;
  ownerKeyIndex?: number | string;
  gameId?: string | PublicKey | null;
  rpcProfileId?: string;
}

function toPk(value: string | PublicKey): PublicKey {
  return typeof value === 'string' ? new PublicKey(value) : value;
}

function toU64Bn(value: unknown, label: string, fallback?: number): BN {
  const resolved = value ?? fallback;
  const num = Number(resolved);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw new Error(`Invalid ${label}: expected a non-negative integer`);
  }
  return new BN(num);
}

function normalizePaymentFrequency(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['@decasecond', 'decasecond', 'decaseconds'].includes(normalized)) return '@decasecond';
  if (['@minute', 'minute', 'minutes', 'min'].includes(normalized)) return '@minute';
  if (['@hourly', 'hourly', 'hour', 'hours'].includes(normalized)) return '@hourly';
  if (['@weekly', 'weekly', 'week', 'weeks'].includes(normalized)) return '@weekly';
  if (['@monthly', 'monthly', 'month', 'months'].includes(normalized)) return '@monthly';
  return '@daily';
}

export async function buildListFleetTx(params: ListFleetTxParams) {
  const owner = toPk(params.owner);
  const ownerProfile = toPk(params.ownerProfile);
  const fleet = toPk(params.fleet);
  const paymentFrequency = normalizePaymentFrequency(params.paymentFrequency);
  const ownerKeyIndex = Number(params.ownerKeyIndex ?? 0);
  const rateAtlas = Number(params.rate);
  if (!Number.isFinite(rateAtlas) || rateAtlas <= 0) {
    throw new Error('Invalid rate: expected a positive number of ATLAS per period');
  }
  const durationMinDays = toU64Bn(params.durationMin, 'durationMin', 1).toNumber();
  const durationMaxDays = toU64Bn(params.durationMax, 'durationMax', 24).toNumber();
  if (!Number.isInteger(ownerKeyIndex) || ownerKeyIndex < 0 || ownerKeyIndex > 65535) {
    throw new Error('Invalid ownerKeyIndex: expected an integer between 0 and 65535');
  }
  if (durationMinDays > durationMaxDays) {
    throw new Error('durationMin cannot be greater than durationMax');
  }
  const profileId = (params.rpcProfileId || ownerProfile.toBase58()).trim() || 'default';
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  const attemptedUrls = new Set<string>();
  let lastError: unknown;

  for (let attempt = 0; attempt < Math.max(1, pool.length); attempt += 1) {
    let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
    try {
      pick = await RpcPoolManager.pickRpcConnection(profileId, {
        waitForMs: 3000,
        allowStale: attempt > 2,
        excludeUrls: attemptedUrls,
      });
      attemptedUrls.add(pick.endpoint.url);
      setSdkConfig({ programs: 'mainnet', rpcUrl: pick.endpoint.url, PublicKey });
      console.log('[LIST] Building createContract tx via SDK:', {
        owner: owner.toBase58(),
        fleet: fleet.toBase58(),
        rateAtlas,
        durationMinDays,
        durationMaxDays,
        ownerKeyIndex,
      });
      const instructions = await createContract({
        owner: owner.toBase58(),
        fleet: fleet.toBase58(),
        rate: { atlas: rateAtlas },
        durationMin: { days: durationMinDays },
        durationMax: { days: durationMaxDays },
        ownerKeyIndex,
        automated: false,
      });
      const contract = await deriveContract(fleet.toBase58());
      const rentalAuthority = await deriveRentalAuthority();
      const tx = new Transaction().add(...instructions.map((instruction) => new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.keys.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data),
      })));
      pick.release({ success: true });
      return {
        tx,
        derivedAccounts: {
          owner: owner.toBase58(),
          ownerProfile: ownerProfile.toBase58(),
          fleet: fleet.toBase58(),
          contract: String(contract),
          rentalAuthority: String(rentalAuthority),
        },
        normalizedArgs: {
          rate: rateAtlas,
          durationMin: durationMinDays,
          durationMax: durationMaxDays,
          paymentFrequency,
          ownerKeyIndex,
        },
      };
    } catch (error) {
      const errorType = getRentalRpcErrorType(error);
      if (pick) pick.release({ success: false, errorType });
      lastError = error;
      if (errorType !== '429' && errorType !== '503') throw error;
      console.warn('[LIST] RPC failed; trying next endpoint', { attempt: attempt + 1, errorType });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'All RPC endpoints failed'));
}
