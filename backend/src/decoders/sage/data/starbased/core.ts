import type { SageInstructionDataset } from "../../types.js";

export const CORE = [
  {
    "name": "ActivateGameState",
    "discriminator": "0x86e32e1555787183",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/activate_game_state.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CopyGameState",
    "discriminator": "0x5f4dfea2f8a81110",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/copy_game_state.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "InitGame",
    "discriminator": "0xfb2e0cd0b8949d49",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/init_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "InitGameState",
    "discriminator": "0xecc72c560c862478",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/init_game_state.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "SyncStarbasePlayer",
    "discriminator": "0x785ea4d8a73b03cc",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/sync_starbase_player.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateGame",
    "discriminator": "0x9f3d848303ead1dc",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateGameState",
    "discriminator": "0x60cb819e4a16e5f8",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_game_state.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;