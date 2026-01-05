import type { SageInstructionDataset } from "../../../../types.js";

export const REGISTRATION = [
  {
    "name": "DeregisterMineItem",
    "discriminator": "0x15baa8c854c32949",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deregister_mine_item.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DeregisterProgressionConfig",
    "discriminator": "0xf9aef2bb8bdb2f76",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deregister_progression_config.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DeregisterResource",
    "discriminator": "0x398c94f608591722",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deregister_resource.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DeregisterStarbase",
    "discriminator": "0x6442d2bb6ec7d36b",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deregister_starbase.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DeregisterSurveyDataUnitTracker",
    "discriminator": "0xff213d788877b8eb",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/deregister_survey_data_unit_tracker.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "InvalidateShip",
    "discriminator": "0x08077356f6435794",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/invalidate_ship.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterMineItem",
    "discriminator": "0x36ad3a4a80746d14",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_mine_item.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterPlanet",
    "discriminator": "0xd55b4e76cf8562ee",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_planet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterProgressionConfig",
    "discriminator": "0x154100f04c8755db",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_progression_config.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterResource",
    "discriminator": "0x57d1a41c0652e8d6",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_resource.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterSageCrewConfig",
    "discriminator": "0xdd907d9e1c19bad1",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_sage_crew_config.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterSagePlayerProfile",
    "discriminator": "0x588eda954b4de49c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_sage_player_profile.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterSagePointModifier",
    "discriminator": "0xd4fba4b49e13ad16",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_sage_point_modifier.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterSector",
    "discriminator": "0x37393ac024eb246d",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_sector.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterShip",
    "discriminator": "0x06337f5c394cb0a5",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_ship.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterStar",
    "discriminator": "0x0f1969eab1d793bf",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_star.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterStarbase",
    "discriminator": "0x6921248aa5b53339",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_starbase.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterStarbasePlayer",
    "discriminator": "0x3c129e13d09353e2",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_starbase_player.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "RegisterSurveyDataUnitTracker",
    "discriminator": "0xd048633f00d6289b",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/register_survey_data_unit_tracker.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateMineItem",
    "discriminator": "0xe619897592567930",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_mine_item.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdatePlanet",
    "discriminator": "0x182c47861f20c9b2",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_planet.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateProgressionConfig",
    "discriminator": "0x27d99652edd664b8",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_progression_config.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateResource",
    "discriminator": "0xf0d09c56e6d80164",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_resource.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateShip",
    "discriminator": "0x67e724d5bb482afc",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_ship.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateStar",
    "discriminator": "0x91920c560c3027a9",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_star.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateStarbase",
    "discriminator": "0x4e9268a66f925f1c",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_starbase.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "UpdateSurveyDataUnitTracker",
    "discriminator": "0xce1bf719ddcfdb23",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/update_survey_data_unit_tracker.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;