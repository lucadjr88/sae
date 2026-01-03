import type { SageInstructionDataset } from "../../types.js";

export const STARBASE_UPGRADES = [
  {
    "name": "CloseUpgradeProcess",
    "discriminator": "0xd6848a7b88115952",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_upgrade_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CompleteStarbaseUpgrade",
    "discriminator": "0x8f5cc0f9156cad51",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/complete_starbase_upgrade.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CreateStarbaseUpgradeResourceProcess",
    "discriminator": "0x1d05cafdb707042c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/create_starbase_upgrade_resource_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DepositStarbaseUpkeepResource",
    "discriminator": "0xb0a00bfa22425e0c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deposit_starbase_upkeep_resource.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StartStarbaseUpgrade",
    "discriminator": "0xa5e153a79ed38fcd",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/start_starbase_upgrade.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "SubmitStarbaseUpgradeResource",
    "discriminator": "0x35b6e6e839c9a778",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/submit_starbase_upgrade_resource.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "SyncStarbaseUpgradeIngredients",
    "discriminator": "0xa9fd02132e4912dc",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/sync_starbase_upgrade_ingredients.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;