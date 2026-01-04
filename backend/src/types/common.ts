export interface DecodedInstruction {
  recipeName?: string;
  recipe?: string;
  material?: string;
  actions?: Action[];
  claimedItems?: ClaimedItem[];
  burnedMaterials?: BurnedMaterial[];
}

export interface Action {
  recipeName?: string;
  claimedItems?: ClaimedItem[];
  burnedMaterials?: BurnedMaterial[];
}

export interface ClaimedItem {
  material?: string;
  item?: string;
  amount?: number;
}

export interface BurnedMaterial {
  material: string;
  amount?: number;
}

export interface MaterialEntry {
  material?: string;
  recipe?: string;
  decodedMaterial?: string;
}