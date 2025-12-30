
export type OpType =
  | 'cargo'
  | 'subwarp'
  | 'mining'
  | 'fees'
  | 'crafting'
  | 'staking'
  | 'token'
  | 'system'
  | 'compute'
  | 'memo'
  | 'stake'
  | 'associatedToken'
  | 'addressLookup'
  | 'altro';

export interface WalletTx {
  accountKeys: string[];
  type: OpType;
  amount?: number;
  timestamp?: string;
  txid?: string;
  raw?: any;
}

export function isValidOpType(type: string): type is OpType {
  return [
    'cargo',
    'subwarp',
    'mining',
    'fees',
    'crafting',
    'staking',
    'altro',
  ].includes(type as OpType);
}
