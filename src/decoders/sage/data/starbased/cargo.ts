import type { SageInstructionDataset } from "../../types.js";

export const CARGO = [
  {
    "name": "CloseFleetCargoPodTokenAccount",
    "discriminator": "0x4e7cf7a394fd8e44",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_fleet_cargo_pod_token_account.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CloseStarbaseCargoTokenAccount",
    "discriminator": "0x61a4629eb4c3fb50",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_starbase_cargo_token_account.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CreateCargoPod",
    "discriminator": "0x8f3e85508553a711",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/create_cargo_pod.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DepositCargoToFleet",
    "discriminator": "0x37eb697b00fd40ed",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deposit_cargo_to_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DepositCargoToGame",
    "discriminator": "0x57317594f1f7b012",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deposit_cargo_to_game.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RemoveCargoPod",
    "discriminator": "0xd8174e68ef2b0803",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/remove_cargo_pod.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "TransferCargoAtStarbase",
    "discriminator": "0x0cbea6be7b77d650",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/transfer_cargo_at_starbase.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "TransferCargoWithinFleet",
    "discriminator": "0xc96d29db3934b417",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/transfer_cargo_within_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "WithdrawCargoFromFleet",
    "discriminator": "0x05a380e96c511f38",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/withdraw_cargo_from_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "WithdrawCargoFromGame",
    "discriminator": "0x66da5835ffc2183e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/withdraw_cargo_from_game.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;