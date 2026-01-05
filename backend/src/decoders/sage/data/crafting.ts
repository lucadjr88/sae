import type { SageInstructionDataset } from "../../../types.js";

export const CRAFTING = [
  {
    "name": "AddConsumableInputToRecipe",
    "discriminator": "0x0aa0ee32d57ffe44",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/add_consumable_input_to_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "AddCraftingFacilityRecipeCategory",
    "discriminator": "0xad39ea166dee23ac",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/add_crafting_facility_recipe_category.rs",
    "domain": "crafting"
  },
  {
    "name": "AddNonConsumableInputToRecipe",
    "discriminator": "0xa313461b014476f9",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/add_non_consumable_input_to_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "AddOutputToRecipe",
    "discriminator": "0x34406d58eaaae2f3",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/add_output_to_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "AddRecipeIngredient",
    "discriminator": "0xb9b55279bfece704",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/add_recipe_ingredient.rs",
    "domain": "crafting"
  },
  {
    "name": "BurnConsumableIngredient",
    "discriminator": "0x041231a72489ea3b",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/burn_consumable_ingredient.rs",
    "domain": "crafting"
  },
  {
    "name": "CancelCraftingProcess",
    "discriminator": "0xd71e81805be7f94e",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/cancel_crafting_process.rs",
    "domain": "crafting"
  },
  {
    "name": "ClaimNonConsumableIngredient",
    "discriminator": "0x5546192fb552f769",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/claim_non_consumable_ingredient.rs",
    "domain": "crafting"
  },
  {
    "name": "ClaimRecipeOutput",
    "discriminator": "0xfd228c9897c0a916",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/claim_recipe_output.rs",
    "domain": "crafting"
  },
  {
    "name": "CloseCraftingProcess",
    "discriminator": "0xca15e19c0f046a5d",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/close_crafting_process.rs",
    "domain": "crafting"
  },
  {
    "name": "CreateCraftingProcess",
    "discriminator": "0x361903475ad7636c",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/create_crafting_process.rs",
    "domain": "crafting"
  },
  {
    "name": "DeregisterCraftingFacility",
    "discriminator": "0x4e416ad2a4222225",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/deregister_crafting_facility.rs",
    "domain": "crafting"
  },
  {
    "name": "DeregisterRecipeCategory",
    "discriminator": "0x678d6598d241e636",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/deregister_recipe_category.rs",
    "domain": "crafting"
  },
  {
    "name": "DrainCraftableItemBank",
    "discriminator": "0x09f6e88937f23766",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/drain_craftable_item_bank.rs",
    "domain": "crafting"
  },
  {
    "name": "InitializeDomain",
    "discriminator": "0x7cb765f73feadba5",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/initialize_domain.rs",
    "domain": "crafting"
  },
  {
    "name": "LegitimizeRecipeIngredient",
    "discriminator": "0xf4480e8e271e7cd4",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/legitimize_recipe_ingredient.rs",
    "domain": "crafting"
  },
  {
    "name": "RegisterCraftableItem",
    "discriminator": "0xd71ccee77c637284",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/register_craftable_item.rs",
    "domain": "crafting"
  },
  {
    "name": "RegisterCraftingFacility",
    "discriminator": "0xae12c608fe7f7426",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/register_crafting_facility.rs",
    "domain": "crafting"
  },
  {
    "name": "RegisterRecipe",
    "discriminator": "0x850f2c7e4e8599d0",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/register_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "RegisterRecipeCategory",
    "discriminator": "0x9454b1ed16f42532",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/register_recipe_category.rs",
    "domain": "crafting"
  },
  {
    "name": "RemoveConsumableInputFromRecipe",
    "discriminator": "0xb7d300e3ed82f61c",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/remove_consumable_input_from_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "RemoveCraftingFacilityRecipeCategory",
    "discriminator": "0xd5fd014bea1c7d16",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/remove_crafting_facility_recipe_category.rs",
    "domain": "crafting"
  },
  {
    "name": "RemoveNonConsumableInputFromRecipe",
    "discriminator": "0xfd6c3b7d370e14e6",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/remove_non_consumable_input_from_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "RemoveOutputFromRecipe",
    "discriminator": "0x661853308b28ad16",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/remove_output_from_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "RemoveRecipeIngredient",
    "discriminator": "0xe91d0d16773f5acf",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/remove_recipe_ingredient.rs",
    "domain": "crafting"
  },
  {
    "name": "StartCraftingProcess",
    "discriminator": "0x406c6d3e09808af6",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/start_crafting_process.rs",
    "domain": "crafting"
  },
  {
    "name": "StopCraftingProcess",
    "discriminator": "0x31c0acf44f2caab2",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/stop_crafting_process.rs",
    "domain": "crafting"
  },
  {
    "name": "UpdateCraftingFacility",
    "discriminator": "0xb8065c1c8f2bf527",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/update_crafting_facility.rs",
    "domain": "crafting"
  },
  {
    "name": "UpdateDomain",
    "discriminator": "0xabb913e6a94fd536",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/update_domain.rs",
    "domain": "crafting"
  },
  {
    "name": "UpdateRecipe",
    "discriminator": "0x4f768fed4424f20f",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/update_recipe.rs",
    "domain": "crafting"
  },
  {
    "name": "UpdateRecipeCategory",
    "discriminator": "0xf900d6c76c53d009",
    "source": "../star-atlas-decoders-main/carbon-decoders/crafting-decoder/src/instructions/update_recipe_category.rs",
    "domain": "crafting"
  }
] as const satisfies SageInstructionDataset;
