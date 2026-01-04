import type { SageInstructionDataset } from "../../types.js";

export const CREW = [
  {
    "name": "AddCrewToGame",
    "discriminator": "0x27b372c92d34528e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/add_crew_to_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ClosePlayerCrewRecord",
    "discriminator": "0x42e8136cb4c012e9",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_player_crew_record.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "MintCrewToGame",
    "discriminator": "0x40de5ef395413684",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/mint_crew_to_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RemoveCrewFromGame",
    "discriminator": "0xf28b4c0f17b66475",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/remove_crew_from_game.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;