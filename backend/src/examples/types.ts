// Shared interfaces for transaction analysis

export type Domain = "starbased" | "crafting";

export type SageInstructionEntry = {
  name: string;
  discriminator: string;
  source: string;
  description?: string;
  category?: string;
  domain?: Domain; // solo diagnostico
};

export type SageInstructionDataset = readonly SageInstructionEntry[];

export interface TransactionInfo {
  signature: string;
  blockTime: number;
  slot: number;
  err: any;
  memo?: string;
  timestamp: string;
  status: 'success' | 'failed';
  fee: number;
  programIds: string[];
  instructions?: string[];
  logMessages?: string[];
  accountKeys?: string[];
  craftingMaterial?: string;
  decodedRecipe?: any;
  compositeDecoded?: any; // Decoded composite instructions for SAGE transactions
  meta?: any;
  fleetAssigned?: boolean; // Flag for fallback association
}

export interface FleetOperation {
  fleetAccount: string;
  operation: string;
  count: number;
  totalFee: number;
  transactions: TransactionInfo[];
}
