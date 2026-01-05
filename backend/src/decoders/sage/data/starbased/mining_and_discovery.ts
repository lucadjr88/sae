import type { SageInstructionDataset } from "../../../../types.js";

export const MINING_DISCOVERY = [
  {
    "name": "DiscoverSector",
    "discriminator": "0x6de7e779cb2c1628",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/discover_sector.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DrainMineItemBank",
    "discriminator": "0xdd4c5c7fe6232943",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/drain_mine_item_bank.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "DrainSurveyDataUnitsBank",
    "discriminator": "0xe3635637dac960d0",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/drain_survey_data_units_bank.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "ScanForSurveyDataUnits",
    "discriminator": "0x5466ea017e88ba93",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/scan_for_survey_data_units.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StartMiningAsteroid",
    "discriminator": "0xbad7501eaee2d321",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/start_mining_asteroid.rs",
    "domain": "starbased",
    "description": ""
  },
  {
    "name": "StopMiningAsteroid",
    "discriminator": "0xb54d2da3671bd351",
    "source": "../star-atlas-decoders-main/carbon-decoders/sage-starbased-decoder/src/instructions/stop_mining_asteroid.rs",
    "domain": "starbased",
    "description": ""
  }
] as const satisfies SageInstructionDataset;