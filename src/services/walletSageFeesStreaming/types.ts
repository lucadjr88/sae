// Tipi forti per walletSageFeesStreaming

import type { IRpcPool } from '../../services/IRpcPool';

export interface StreamingOptions {
  concurrency?: number;
  timeoutMs?: number;
  stream?: boolean;
  onProgress?: (progress: StreamingProgress) => void;
  enableSubAccountMapping?: boolean; // Nuovo flag per abilitare mappatura sub-accounts
  [key: string]: any;
}

export interface StreamingProgress {
  processed: number;
  total?: number;
  lastChunk?: any;
  [key: string]: any;
}

export interface StreamingResult {
  walletPubkey: string;
  period: string;
  totalFees: number;
  transactionCount: number;
  items: any[];
  partial?: boolean;
  errors?: any[];
  metrics?: any;
}

export interface WalletSageFeesStreamingServices {
  rpcPool: IRpcPool;
  logger?: { log: (...args: any[]) => void };
  metrics?: { emit: (name: string, value: any) => void };
}

export interface FleetData {
  cargoHold?: string;
  fuelTank?: string;
  ammoBank?: string;
}
