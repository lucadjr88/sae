import { Connection, type Commitment } from '@solana/web3.js';
import { getSingleHealthyRpc } from './singleRpcManager.js';

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

export async function getRpcConnectionWithUrl(options: RpcConnectionOptions = {}): Promise<{ connection: Connection; rpcUrl: string }> {
  const rpcUrl = options.rpcUrl ?? await getHealthyRpcUrlOrThrow();
  const commitment = options.commitment ?? 'confirmed';
  return {
    rpcUrl,
    connection: new Connection(rpcUrl, commitment),
  };
}

export async function getRpcConnection(options: RpcConnectionOptions = {}): Promise<Connection> {
  const { connection } = await getRpcConnectionWithUrl(options);
  return connection;
}