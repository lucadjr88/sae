import type { SageInstructionDataset } from "../../../../types.js";

export const CRAFTING = [
  {
    "name": "BurnCraftingConsumables",
    "discriminator": "0x0de1cb5b36e87eaa",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/burn_crafting_consumables.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CancelCraftingProcess",
    "discriminator": "0xd71e81805be7f94e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/cancel_crafting_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ClaimCraftingNonConsumables",
    "discriminator": "0x1291aa803bf15388",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/claim_crafting_non_consumables.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ClaimCraftingOutputs",
    "discriminator": "0xd7473b1c9c5dbcff",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/claim_crafting_outputs.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CloseCraftingProcess",
    "discriminator": "0xca15e19c0f046a5d",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_crafting_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CreateCraftingProcess",
    "discriminator": "0x361903475ad7636c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/create_crafting_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DepositCraftingIngredient",
    "discriminator": "0x202391d538ffd19c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deposit_crafting_ingredient.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StartCraftingProcess",
    "discriminator": "0x406c6d3e09808af6",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/start_crafting_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StopCraftingProcess",
    "discriminator": "0x31c0acf44f2caab2",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/stop_crafting_process.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "WithdrawCraftingIngredient",
    "discriminator": "0xda00cf4dfd74f8fa",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/withdraw_crafting_ingredient.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;