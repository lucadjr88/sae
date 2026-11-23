import { PublicKey, Transaction } from '@solana/web3.js';
import { createRequire } from 'node:module';
import { getHealthyRpcUrlOrThrow } from '../../utils/rpc/connection.js';

const require = createRequire(import.meta.url);
const srslyV2 = require('@sly-rentals/core/legacy') as typeof import('@sly-rentals/core/legacy');
const SRSLY_PROGRAM_ID = new PublicKey('SRSLYxcFnjd5jG2DpJw4as6UEyjwJQK1U4J1TD1hvZH');

export interface CancelRentalTxParams {
  borrower: string | PublicKey;
  contract: string | PublicKey;
  rental_state: string | PublicKey;
  rental_thread: string | PublicKey;
}

export async function cancelRentalTx(params: CancelRentalTxParams): Promise<Transaction> {
  const borrower = typeof params.borrower === 'string' ? new PublicKey(params.borrower) : params.borrower;
  const contract = typeof params.contract === 'string' ? new PublicKey(params.contract) : params.contract;
  const rpcUrl = await getHealthyRpcUrlOrThrow();
  srslyV2.setSdkConfig({ programs: 'mainnet', rpcUrl, commitment: 'confirmed', PublicKey });
  console.log('[cancelRentalTx] Building SRSLY v2 cancelRental instruction', {
    borrower: borrower.toBase58(),
    contract: contract.toBase58(),
  });
  const instructions = await srslyV2.cancelRental({
    borrower: borrower.toBase58(),
    contract: contract.toBase58(),
    cancelDelay: 0,
  }, { rpcUrl, programs: 'mainnet', PublicKey });

  const tx = new Transaction();
  tx.add(...instructions.map((instruction) => ({
    ...instruction,
    programId: new PublicKey(instruction.programId),
    data: Buffer.from(instruction.data),
    keys: instruction.keys.map((key) => ({
      ...key,
      pubkey: new PublicKey(key.pubkey),
    })),
  })));
  tx.instructions = tx.instructions.filter((ix) => ix.programId.equals(SRSLY_PROGRAM_ID));

  console.log('[cancelRentalTx] Transaction built. Instruction count:', tx.instructions.length);
  console.log('[cancelRentalTx] Instruction data (hex):', tx.instructions[0]?.data?.toString('hex') || 'N/A');
  console.log('[cancelRentalTx] TX oggetto:', tx);
  if (tx.instructions.length !== 1) {
    throw new Error(`[cancelRentalTx] Expected 1 SRSLY instruction, found ${tx.instructions.length}`);
  }
  return tx;
}
