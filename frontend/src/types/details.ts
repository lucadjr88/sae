export interface CraftingDetail {
  [key: string]: any;
  fee?: number | string;
  amount?: number;
  name?: string;
  id?: string;
  timestamp?: number | string;
}

export interface Prices {
  solana?: { usd?: number };
}

export type DecodedInstruction = any;
export type BurnedMaterial = any;
export type ClaimedItem = any;
export type MaterialEntry = any;
export type DecodedGeneric = any;

