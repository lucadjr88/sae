// Wrapper API estratti da pool-connection.ts
// Ogni funzione accetta una istanza di core (es: executeWithPool) e la usa per chiamare l'RPC

import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo, AccountInfo } from '@solana/web3.js';
import { RpcOperationOptions, PoolContext } from './pool-connection-types.js';


// Queste funzioni sono pensate per essere usate come metodi o funzioni standalone
// e richiedono un PoolContext come primo argomento


import { executeWithPool } from './pool-connection-core.js';

export async function getTransaction(ctx: PoolContext, signature: string, opts?: RpcOperationOptions & { maxSupportedTransactionVersion?: number }): Promise<any | null> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getTransaction(signature, {
        maxSupportedTransactionVersion: opts?.maxSupportedTransactionVersion,
      }),
    opts
  );
}

export async function getSignaturesForAddress(ctx: PoolContext, address: PublicKey, opts?: RpcOperationOptions & { limit?: number; before?: string; until?: string }): Promise<ConfirmedSignatureInfo[]> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getSignaturesForAddress(address, {
        limit: opts?.limit,
        before: opts?.before,
        until: opts?.until,
      }),
    opts
  );
}

export async function getParsedTransaction(ctx: PoolContext, signature: string, opts?: RpcOperationOptions & { maxSupportedTransactionVersion?: number }): Promise<ParsedTransactionWithMeta | null> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: opts?.maxSupportedTransactionVersion,
      }),
    opts
  );
}

export async function getAccountInfo(ctx: PoolContext, address: PublicKey, opts?: RpcOperationOptions & { commitment?: 'processed' | 'confirmed' | 'finalized' }): Promise<AccountInfo<Buffer> | null> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getAccountInfo(address, {
        commitment: opts?.commitment,
      }),
    opts
  );
}

export async function getParsedAccountInfo(ctx: PoolContext, address: PublicKey, opts?: RpcOperationOptions & { commitment?: 'processed' | 'confirmed' | 'finalized' }): Promise<any | null> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getParsedAccountInfo(address, {
        commitment: opts?.commitment,
      }),
    opts
  );
}

export async function getProgramAccounts(ctx: PoolContext, programId: PublicKey, opts?: any): Promise<any[]> {
  return executeWithPool(
    ctx,
    async (conn, index) => {
      return (conn as any).getProgramAccounts(programId, opts);
    },
    { timeoutMs: opts?.timeoutMs, maxRetries: opts?.maxRetries }
  );
}

export async function getMultipleAccountsInfo(ctx: PoolContext, addresses: PublicKey[], opts?: any): Promise<(AccountInfo<Buffer> | null)[]> {
  return executeWithPool(
    ctx,
    async (conn, index) => {
      return (conn as any).getMultipleAccountsInfo(addresses, opts);
    },
    { timeoutMs: opts?.timeoutMs, maxRetries: opts?.maxRetries }
  );
}

export async function getEpochInfo(ctx: PoolContext, opts?: RpcOperationOptions & { commitment?: 'processed' | 'confirmed' | 'finalized' }): Promise<any> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getEpochInfo(opts?.commitment),
    opts
  );
}

export async function getSlot(ctx: PoolContext, opts?: RpcOperationOptions & { commitment?: 'processed' | 'confirmed' | 'finalized' }): Promise<number> {
  return executeWithPool(
    ctx,
    async (conn, _index) =>
      conn.getSlot(opts?.commitment),
    opts
  );
}
