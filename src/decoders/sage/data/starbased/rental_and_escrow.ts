import type { SageInstructionDataset } from "../../types.js";

export const RENTAL_ESCROW = [
  {
    "name": "AddRental",
    "discriminator": "0xd571aa7bbb5a1c73",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/add_rental.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "AddShipEscrow",
    "discriminator": "0xba13da96a7b5d459",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/add_ship_escrow.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ChangeRental",
    "discriminator": "0x6b7add180cf946c1",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/change_rental.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "InvalidateRental",
    "discriminator": "0xb4b76a99ff08e8b2",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/invalidate_rental.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RemoveInvalidShipEscrow",
    "discriminator": "0xf80f10c50df82700",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/remove_invalid_ship_escrow.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RemoveShipEscrow",
    "discriminator": "0x43046ca1ba6a7d34",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/remove_ship_escrow.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateShipEscrow",
    "discriminator": "0xadcf65f7ace42769",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_ship_escrow.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;