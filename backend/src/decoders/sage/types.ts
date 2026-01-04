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

export type GeneratedMap = readonly SageInstructionEntry[];