import type { SageInstructionDataset } from "../../types.js";
import { CERTIFICATES } from "./certificates.js";
import { CONNECTIONS } from "./connections.js";
import { DEV } from "./dev.js";
import { CREW } from "./crew.js";
import { MINING_DISCOVERY } from "./mining_and_discovery.js";
import { CORE } from "./core.js";
import { RENTAL_ESCROW } from "./rental_and_escrow.js";
import { STARBASE_UPGRADES } from "./starbase_upgrades.js";
import { CARGO } from "./cargo.js";
import { CRAFTING } from "./crafting.js";
import { FLEET } from "./fleet.js";
import { REGISTRATION } from "./registration.js";

export const STARBASED = [
  ...CORE,
  ...CONNECTIONS,
  ...CREW,
  ...RENTAL_ESCROW,
  ...FLEET,
  ...CRAFTING,
  ...CARGO,
  ...STARBASE_UPGRADES,
  ...CERTIFICATES,
  ...MINING_DISCOVERY,
  ...DEV,
  ...REGISTRATION,
] as const satisfies SageInstructionDataset;