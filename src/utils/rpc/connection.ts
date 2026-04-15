import { Connection, type Commitment } from '@solana/web3.js';
import { getSingleHealthyRpc } from './prune.js';

type RpcConnectionOptions = {
  rpcUrl?: string;
  commitment?: Commitment;
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
  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

export async function getRpcConnectionWithUrl(options: RpcConnectionOptions = {}): Promise<{ connection: Connection; rpcUrl: string }> {
  const rpcUrl = options.rpcUrl ?? await getHealthyRpcUrlOrThrow();
  const commitment = options.commitment ?? 'confirmed';
  return {
    rpcUrl,
    connection: new Connection(rpcUrl, { commitment, fetch: fetchWithTimeout }),
  };
}

export async function getRpcConnection(options: RpcConnectionOptions = {}): Promise<Connection> {
  const { connection } = await getRpcConnectionWithUrl(options);
  return connection;
}