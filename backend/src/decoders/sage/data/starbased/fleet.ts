import type { SageInstructionDataset } from "../../../../types.js";

export const FLEET = [
  {
    "name": "AddShipToFleet",
    "discriminator": "0xeda699487ab3dc4e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/add_ship_to_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CloseDisbandedFleet",
    "discriminator": "0xd696959cf57b25a5",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/close_disbanded_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "CreateFleet",
    "discriminator": "0x4c7b5152ebe49ccb",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/create_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DisbandFleet",
    "discriminator": "0x278b0e552d10d798",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/disband_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DisbandedFleetToEscrow",
    "discriminator": "0xa55a47de9b070e79",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/disbanded_fleet_to_escrow.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "FleetStateHandler",
    "discriminator": "0x724dfc1b34a1029c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/fleet_state_handler.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ForceDisbandFleet",
    "discriminator": "0x12f535779b39014e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/force_disband_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ForceDropFleetCargo",
    "discriminator": "0xaa78bf2effc350dd",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/force_drop_fleet_cargo.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "IdleToLoadingBay",
    "discriminator": "0xe32e044a97f82983",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/idle_to_loading_bay.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "IdleToRespawn",
    "discriminator": "0xebcfc8aea1745ba8",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/idle_to_respawn.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "LoadFleetCrew",
    "discriminator": "0x2709d4daa76b89d0",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/load_fleet_crew.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "LoadingBayToIdle",
    "discriminator": "0x0d50e23f18acbe57",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/loading_bay_to_idle.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "LoadingBayToRespawn",
    "discriminator": "0xbf7c5dbc10fb0f7a",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/loading_bay_to_respawn.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "MineAsteroidToRespawn",
    "discriminator": "0xd03f876cdafc2400",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/mine_asteroid_to_respawn.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RespawnToLoadingBay",
    "discriminator": "0x69c48bee0d467de2",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/respawn_to_loading_bay.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "SetNextShip",
    "discriminator": "0xb8ef76ed5ca9b1ae",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/set_next_ship.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StartSubwarp",
    "discriminator": "0xc068c5281e279b30",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/start_subwarp.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StopSubwarp",
    "discriminator": "0x963a030006cf772e",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/stop_subwarp.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UnloadFleetCrew",
    "discriminator": "0x675f2a554f904720",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/unload_fleet_crew.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateShipInFleet",
    "discriminator": "0xd553bae5b31facfd",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_ship_in_fleet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "WarpLane",
    "discriminator": "0xe8bcc3316448e7f3",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/warp_lane.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "WarpToCoordinate",
    "discriminator": "0x573c329af16a4d17",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/warp_to_coordinate.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;