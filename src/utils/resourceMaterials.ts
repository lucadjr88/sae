export type MaterialInfo = {
  name: string;
  symbol: string;
  category: string;
  decimals: number;
};

const MATERIAL_MINT_ALIASES: Record<string, string> = {
  EqXFCQHVoo89UjSUqPbLLt1T6zRKhT3E13AzF3unUs9G: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK',
  '8pbBwqniQv23ZC6UngxeZMiaAWiv9G2N8ydKJquNRZ8E': 'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim'
};

export const MATERIAL_REGISTRY: Record<string, MaterialInfo> = {
  foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG: {
    name: 'Food',
    symbol: 'FOOD',
    category: 'consumable',
    decimals: 0
  },
  HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp: {
    name: 'Hydrogen',
    symbol: 'HYDR',
    category: 'fuel',
    decimals: 0
  },
  ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK: {
    name: 'Ammo',
    symbol: 'AMMO',
    category: 'consumable',
    decimals: 0
  },
  fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim: {
    name: 'Fuel',
    symbol: 'FUEL',
    category: 'fuel',
    decimals: 0
  },
  SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM: {
    name: 'Survey Data Unit',
    symbol: 'SDU',
    category: 'resource',
    decimals: 0
  },
};

const MATERIAL_PREFIX_REGISTRY: Array<{ prefix: string; info: MaterialInfo }> = [
  { prefix: 'food', info: { name: 'Food', symbol: 'FOOD', category: 'consumable', decimals: 0 } },
  { prefix: 'ammo', info: { name: 'Ammo', symbol: 'AMMO', category: 'consumable', decimals: 0 } },
  { prefix: 'fuel', info: { name: 'Fuel', symbol: 'FUEL', category: 'fuel', decimals: 0 } },
  { prefix: 'hydr', info: { name: 'Hydrogen', symbol: 'HYDR', category: 'fuel', decimals: 0 } },
  { prefix: 'sdu', info: { name: 'Survey Data Unit', symbol: 'SDU', category: 'resource', decimals: 0 } },
  { prefix: 'atlas', info: { name: 'Atlas', symbol: 'ATLAS', category: 'token', decimals: 0 } },
  { prefix: 'polis', info: { name: 'Polis', symbol: 'POLIS', category: 'token', decimals: 0 } }
];

export function normalizeMaterialMint(mint: string): string {
  return MATERIAL_MINT_ALIASES[mint] || mint;
}

export function getMaterialInfo(mint: string): Partial<MaterialInfo> {
  const normalizedMint = normalizeMaterialMint(mint);

  if (MATERIAL_REGISTRY[normalizedMint]) {
    return MATERIAL_REGISTRY[normalizedMint];
  }

  const mintLower = normalizedMint.toLowerCase();
  const byPrefix = MATERIAL_PREFIX_REGISTRY.find((entry) => mintLower.startsWith(entry.prefix));
  if (byPrefix) {
    return byPrefix.info;
  }

  return {
    name: `Token ${normalizedMint.substring(0, 8)}...`,
    symbol: normalizedMint.substring(0, 4).toUpperCase(),
    category: 'unknown'
  };
}
