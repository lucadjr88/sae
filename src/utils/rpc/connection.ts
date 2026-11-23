import { Connection, type Commitment } from '@solana/web3.js';
import nodeFetch, { Headers } from 'node-fetch';
import { getSingleHealthyRpc } from './prune.js';

type RpcConnectionOptions = {
  rpcUrl?: string;
  commitment?: Commitment;
  disableRetryOnRateLimit?: boolean;
};

export async function getHealthyRpcUrlOrThrow(): Promise<string> {
  const rpcUrl = await getSingleHealthyRpc();
  if (!rpcUrl) {
    throw new Error('No healthy RPC available');
  }
  return rpcUrl;
}

// Custom fetch with 30s timeout
function fetchWithTimeout(resource: RequestInfo, options: RequestInit = {}) {
  const timeout = 20000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return nodeFetch(resource as any, { ...options, signal: controller.signal } as any)
    .finally(() => clearTimeout(id));
}

export async function getRpcConnectionWithUrl(options: RpcConnectionOptions & { headers?: Record<string, string> } = {}): Promise<{ connection: Connection; rpcUrl: string }> {
  const rpcUrl = options.rpcUrl ?? await getHealthyRpcUrlOrThrow();
  const commitment = options.commitment ?? 'confirmed';
  const customHeaders = options.headers;
  
  const customFetch: typeof nodeFetch = (resource, init) => {
    const timeout = 20000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    const mergedHeaders = new Headers(init?.headers);
    for (const [name, value] of Object.entries(customHeaders || {})) mergedHeaders.set(name, value);
    if (!mergedHeaders.has('accept-encoding')) mergedHeaders.set('accept-encoding', 'identity');
    
    return nodeFetch(resource as any, {
      ...init,
      headers: mergedHeaders,
      signal: controller.signal
    } as any).finally(() => clearTimeout(id));
  };

  return {
    rpcUrl,
    connection: new Connection(rpcUrl, { commitment, fetch: customFetch as any, disableRetryOnRateLimit: options.disableRetryOnRateLimit }),
  };
}

export async function getRpcConnection(options: RpcConnectionOptions = {}): Promise<Connection> {
  const { connection } = await getRpcConnectionWithUrl(options);
  return connection;
}