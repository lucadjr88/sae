import { ComputeBudgetProgram, type Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createRequire } from 'node:module';
import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';
import { getRentalRpcErrorType } from './rentalRpc.js';

const require = createRequire(import.meta.url);
const { acceptRental, createBorrower, setSdkConfig } = require('@sly-rentals/core/legacy') as typeof import('@sly-rentals/core/legacy');
export const SRSLY_PROGRAM_ID = new PublicKey('SRSLYxcFnjd5jG2DpJw4as6UEyjwJQK1U4J1TD1hvZH');

export interface AcceptRentalTxParams {
  borrower: PublicKey;
  borrowerProfile: PublicKey;
  contract: PublicKey;
  rate: bigint;
  durationSeconds: number;
  rpcProfileId?: string;
}

export async function acceptRentalTx(params: AcceptRentalTxParams): Promise<Transaction> {
  const rawProfileId = params.rpcProfileId || params.borrowerProfile.toBase58();
  const profileId = rawProfileId.trim() || 'default';
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
      const [borrowerState] = await PublicKey.findProgramAddress([
        Buffer.from('borrower_state'), params.borrower.toBuffer(),
      ], SRSLY_PROGRAM_ID);
      const borrowerStateInfo = await (pick.connection as Connection).getAccountInfo(borrowerState);
      const borrowerInstructions = borrowerStateInfo
        ? []
        : await createBorrower({ borrower: params.borrower.toBase58() });
      const instructions = await acceptRental({
        borrower: params.borrower.toBase58(),
        borrowerProfile: params.borrowerProfile.toBase58(),
        contract: params.contract.toBase58(),
        rate: params.rate,
        duration: params.durationSeconds,
        computeUnits: 400_000,
      });
      const computeBudgetInstructions = instructions.filter(
        (instruction) => String(instruction.programId) === 'ComputeBudget111111111111111111111111111111',
      );
      const rentalInstructions = instructions.filter(
        (instruction) => String(instruction.programId) !== 'ComputeBudget111111111111111111111111111111',
      );
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 });
      const tx = new Transaction().add(...[...computeBudgetInstructions, priorityFeeInstruction, ...borrowerInstructions, ...rentalInstructions].map((instruction) => new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.keys.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data),
      })));
      pick.release({ success: true });
      console.log('[acceptRentalTx] Instruction data (hex):', tx.instructions[0].data?.toString('hex') || 'N/A');
      console.log('[acceptRentalTx] SDK arguments:', { rate: params.rate.toString(), durationSeconds: params.durationSeconds });
      console.log('[acceptRentalTx] TX oggetto:', tx);
      return tx;
    } catch (error) {
      const errorType = getRentalRpcErrorType(error);
      if (pick) pick.release({ success: false, errorType });
      lastError = error;
      if (errorType !== '429' && errorType !== '503') throw error;
      console.warn('[acceptRentalTx] RPC failed; trying next endpoint', { attempt: attempt + 1, errorType });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'All RPC endpoints failed'));
}
