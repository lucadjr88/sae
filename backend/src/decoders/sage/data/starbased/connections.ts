import type { SageInstructionDataset } from "../../types.js";

export const CONNECTIONS = [
  {
    "name": "AddConnection",
    "discriminator": "0x28064500e696d729",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/add_connection.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RemoveConnection",
    "discriminator": "0xc891776755be788a",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/remove_connection.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;