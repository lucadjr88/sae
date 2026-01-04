export interface CraftingDetail {
  action?: string;
  type?: string;
  displayType?: string;
  material?: string;
  fee: string | number;
  txid?: string;
  signature?: string;
  fleet?: string;
  decodedData?: DecodedData;
  decodedRecipe?: DecodedData;
  decodedKind?: 'process' | 'recipe' | 'item' | string;
}

export type DecodedData = DecodedProcess | DecodedRecipe | DecodedItem | DecodedGeneric;

export interface DecodedProcess {
  recipe?: string;
  recipe_pubkey?: string;
  recipeId?: string;
  crafting_facility?: string;
  craftingFacility?: string;
  quantity?: number;
}

export interface DecodedRecipe {
  category?: string;
  version?: string;
  recipe_items?: Array<{ mint?: string }>;
  recipeName?: string;
}

export interface DecodedItem {
  mint?: string;
  item_mint?: string;
}

export interface DecodedGeneric {
  burnedMaterials?: any[];
  claimedItems?: any[];
  actions?: Array<{
    burnedMaterials?: any[];
    claimedItems?: any[];
  }>;
}

export interface Prices {
  solana?: { usd: number };
}