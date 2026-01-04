// Tipi e interfacce estratti da pool-connection.ts

import { PublicKey } from '@solana/web3.js';

export interface RpcOperationOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fallbackToDefault?: boolean;
  logErrors?: boolean;
  rateLimitBackoffBaseMs?: number;
  markUnhealthyOn429Threshold?: number;
}

export interface PoolContext {
  poolManager: any; // RpcPoolManager
  defaultConnection: any; // Connection
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  defaultLogErrors?: boolean;
}
