import type { SageInstructionDataset } from "../../types.js";

export const DEV = [
  {
    "name": "DevAddCrewToGame",
    "discriminator": "0x50f4294448a91acf",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/dev_add_crew_to_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DevDepositCargoToGame",
    "discriminator": "0x17f657d09557325c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/dev_deposit_cargo_to_game.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;