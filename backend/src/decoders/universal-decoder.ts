import { SAGE_STARBASED_INSTRUCTIONS, CRAFTING_INSTRUCTIONS, DecodedInstruction } from './instruction-maps.js';
import { decodeInstructionFromLogs } from './instruction-decoder.js';
/**
 * Universal Decoder for Star Atlas Programs
 * Supports:
 * - Crafting Program
 * - SAGE Starbased Program
 * 
 * This decoder integrates with the official Carbon decoders via Rust binary
 */


import { decodeAccountWithRust } from './rust-wrapper.js';
import { CRAFTING_PROGRAM, SAGE_STARBASED_PROGRAM } from './program-constants.js';





export const UNIVERSAL_DECODER = {
  // ...continua rimozione blocco SAGE_STARBASED_INSTRUCTIONS...
  // Fleet operations
  'CreateFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'CreateFleet',
    name: 'Create Fleet',
    category: 'fleet',
    description: 'Create a new fleet'
  },
  'DisbandFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'DisbandFleet',
    name: 'Disband Fleet',
    category: 'fleet',
    description: 'Disband a fleet'
  },
  'AddShipToFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'AddShipToFleet',
    name: 'Add Ship to Fleet',
    category: 'fleet',
    description: 'Add a ship to a fleet'
  },
  'RemoveShipEscrow': {
    program: 'SAGE-Starbased',
    instructionType: 'RemoveShipEscrow',
    name: 'Remove Ship Escrow',
    category: 'fleet',
    description: 'Remove ship from escrow'
  },
  'LoadFleetCrew': {
    program: 'SAGE-Starbased',
    instructionType: 'LoadFleetCrew',
    name: 'Load Fleet Crew',
    category: 'fleet',
    description: 'Load crew into fleet'
  },
  'UnloadFleetCrew': {
    program: 'SAGE-Starbased',
    instructionType: 'UnloadFleetCrew',
    name: 'Unload Fleet Crew',
    category: 'fleet',
    description: 'Unload crew from fleet'
  },

  // Cargo operations
  'DepositCargoToFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'DepositCargoToFleet',
    name: 'Deposit Cargo to Fleet',
    category: 'cargo',
    description: 'Add cargo to fleet'
  },
  'WithdrawCargoFromFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'WithdrawCargoFromFleet',
    name: 'Withdraw Cargo from Fleet',
    category: 'cargo',
    description: 'Remove cargo from fleet'
  },
  'TransferCargoWithinFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'TransferCargoWithinFleet',
    name: 'Transfer Cargo Within Fleet',
    category: 'cargo',
    description: 'Transfer cargo between fleet vessels'
  },
  'DepositCargoToGame': {
    program: 'SAGE-Starbased',
    instructionType: 'DepositCargoToGame',
    name: 'Deposit Cargo to Game',
    category: 'cargo',
    description: 'Deposit cargo into game'
  },
  'WithdrawCargoFromGame': {
    program: 'SAGE-Starbased',
    instructionType: 'WithdrawCargoFromGame',
    name: 'Withdraw Cargo from Game',
    category: 'cargo',
    description: 'Withdraw cargo from game'
  },

  // Warp/Movement operations
  'StartSubwarp': {
    program: 'SAGE-Starbased',
    instructionType: 'StartSubwarp',
    name: 'Start Subwarp',
    category: 'movement',
    description: 'Begin subwarp travel'
  },
  'StopSubwarp': {
    program: 'SAGE-Starbased',
    instructionType: 'StopSubwarp',
    name: 'Stop Subwarp',
    category: 'movement',
    description: 'Stop subwarp travel'
  },
  'WarpToCoordinate': {
    program: 'SAGE-Starbased',
    instructionType: 'WarpToCoordinate',
    name: 'Warp to Coordinate',
    category: 'movement',
    description: 'Warp to a specific coordinate'
  },
  'WarpLane': {
    program: 'SAGE-Starbased',
    instructionType: 'WarpLane',
    name: 'Warp Lane',
    category: 'movement',
    description: 'Use warp lane'
  },

  // Starbase operations
  'RegisterStarbase': {
    program: 'SAGE-Starbased',
    instructionType: 'RegisterStarbase',
    name: 'Register Starbase',
    category: 'starbase',
    description: 'Register a new starbase'
  },
  'DeregisterStarbase': {
    program: 'SAGE-Starbased',
    instructionType: 'DeregisterStarbase',
    name: 'Deregister Starbase',
    category: 'starbase',
    description: 'Deregister a starbase'
  },
  'StartStarbaseUpgrade': {
    program: 'SAGE-Starbased',
    instructionType: 'StartStarbaseUpgrade',
    name: 'Start Starbase Upgrade',
    category: 'starbase',
    description: 'Initiate starbase upgrade'
  },
  'CompleteStarbaseUpgrade': {
    program: 'SAGE-Starbased',
    instructionType: 'CompleteStarbaseUpgrade',
    name: 'Complete Starbase Upgrade',
    category: 'starbase',
    description: 'Finish starbase upgrade'
  },
  'TransferCargoAtStarbase': {
    program: 'SAGE-Starbased',
    instructionType: 'TransferCargoAtStarbase',
    name: 'Transfer Cargo at Starbase',
    category: 'starbase',
    description: 'Transfer cargo at starbase'
  },
  'DepositStarbaseUpkeepResource': {
    program: 'SAGE-Starbased',
    instructionType: 'DepositStarbaseUpkeepResource',
    name: 'Deposit Upkeep Resource',
    category: 'starbase',
    description: 'Deposit starbase upkeep resource'
  },

  // Fleet state transitions
  'IdleToLoadingBay': {
    program: 'SAGE-Starbased',
    instructionType: 'IdleToLoadingBay',
    name: 'Idle to Loading Bay',
    category: 'fleet-state',
    description: 'Move fleet from idle to loading bay'
  },
  'LoadingBayToIdle': {
    program: 'SAGE-Starbased',
    instructionType: 'LoadingBayToIdle',
    name: 'Loading Bay to Idle',
    category: 'fleet-state',
    description: 'Move fleet from loading bay to idle'
  },
  'IdleToRespawn': {
    program: 'SAGE-Starbased',
    instructionType: 'IdleToRespawn',
    name: 'Idle to Respawn',
    category: 'fleet-state',
    description: 'Move fleet from idle to respawn'
  },
  'RespawnToLoadingBay': {
    program: 'SAGE-Starbased',
    instructionType: 'RespawnToLoadingBay',
    name: 'Respawn to Loading Bay',
    category: 'fleet-state',
    description: 'Move fleet from respawn to loading bay'
  },

  // Profile/Registration
  'RegisterSagePlayerProfile': {
    program: 'SAGE-Starbased',
    instructionType: 'RegisterSagePlayerProfile',
    name: 'Register Player Profile',
    category: 'profile',
    description: 'Register a SAGE player profile'
  },
  'MintCrewToGame': {
    program: 'SAGE-Starbased',
    instructionType: 'MintCrewToGame',
    name: 'Mint Crew',
    category: 'profile',
    description: 'Mint crew to game'
  },
  'AddCrewToGame': {
    program: 'SAGE-Starbased',
    instructionType: 'AddCrewToGame',
    name: 'Add Crew to Game',
    category: 'profile',
    description: 'Add crew to game account'
  },

  // Fleet Abilities & Repairs
  'ReloadFleetAbilityPower': {
    program: 'SAGE-Starbased',
    instructionType: 'ReloadFleetAbilityPower',
    name: 'Reload Fleet Ability',
    category: 'fleet',
    description: 'Reload fleet ability power'
  },
  'RepairDockedFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'RepairDockedFleet',
    name: 'Repair Docked Fleet',
    category: 'fleet',
    description: 'Repair a docked fleet'
  },
  'RepairIdleFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'RepairIdleFleet',
    name: 'Repair Idle Fleet',
    category: 'fleet',
    description: 'Repair an idle fleet'
  },
  'RepairStarbase': {
    program: 'SAGE-Starbased',
    instructionType: 'RepairStarbase',
    name: 'Repair Starbase',
    category: 'starbase',
    description: 'Repair a starbase'
  },

  // Combat Operations
  'AttackFleet': {
    program: 'SAGE-Starbased',
    instructionType: 'AttackFleet',
    name: 'Attack Fleet',
    category: 'combat',
    description: 'Attack another fleet'
  },
  'AttackStarbase': {
    program: 'SAGE-Starbased',
    instructionType: 'AttackStarbase',
    name: 'Attack Starbase',
    category: 'combat',
    description: 'Attack a starbase'
  },
  'RetrieveLoot': {
    program: 'SAGE-Starbased',
    instructionType: 'RetrieveLoot',
    name: 'Retrieve Loot',
    category: 'combat',
    description: 'Retrieve loot from combat'
  },

  // Combat Events
  'BattleLogEvent': {
    program: 'SAGE-Starbased',
    instructionType: 'BattleLogEvent',
    name: 'Battle Log Event',
    category: 'combat',
    description: 'Battle log event'
  },
  'CombatInitiatedEvent': {
    program: 'SAGE-Starbased',
    instructionType: 'CombatInitiatedEvent',
    name: 'Combat Initiated',
    category: 'combat',
    description: 'Combat initiated event'
  },
  'CombatLootDropEvent': {
    program: 'SAGE-Starbased',
    instructionType: 'CombatLootDropEvent',
    name: 'Combat Loot Drop',
    category: 'combat',
    description: 'Combat loot drop event'
  },
  'CombatParticipantEvent': {
    program: 'SAGE-Starbased',
    instructionType: 'CombatParticipantEvent',
    name: 'Combat Participant',
    category: 'combat',
    description: 'Combat participant event'
  },
  'StarbaseCombatEvent': {
    program: 'SAGE-Starbased',
    instructionType: 'StarbaseCombatEvent',
    name: 'Starbase Combat Event',
    category: 'combat',
    description: 'Starbase combat event'
  },

  // Certificates
  'MintCertificate': {
    program: 'SAGE-Starbased',
    instructionType: 'MintCertificate',
    name: 'Mint Certificate',
    category: 'profile',
    description: 'Mint a certificate'
  },
  'RedeemCertificate': {
    program: 'SAGE-Starbased',
    instructionType: 'RedeemCertificate',
    name: 'Redeem Certificate',
    category: 'profile',
    description: 'Redeem a certificate'
  },
  'CreateCertificateMint': {
    program: 'SAGE-Starbased',
    instructionType: 'CreateCertificateMint',
    name: 'Create Certificate Mint',
    category: 'profile',
    description: 'Create certificate mint'
  },

  // Starbase Sync & Advanced Operations
  'SyncStarbasePlayer': {
    program: 'SAGE-Starbased',
    instructionType: 'SyncStarbasePlayer',
    name: 'Sync Starbase Player',
    category: 'starbase',
    description: 'Sync starbase player data'
  },
  'SyncStarbaseUpgradeIngredients': {
    program: 'SAGE-Starbased',
    instructionType: 'SyncStarbaseUpgradeIngredients',
    name: 'Sync Starbase Upgrade',
    category: 'starbase',
    description: 'Sync starbase upgrade ingredients'
  },
  'CreateStarbaseUpgradeResourceProcess': {
    program: 'SAGE-Starbased',
    instructionType: 'CreateStarbaseUpgradeResourceProcess',
    name: 'Create Upgrade Resource Process',
    category: 'starbase',
    description: 'Create starbase upgrade resource process'
  },
  'CloseUpgradeProcess': {
    program: 'SAGE-Starbased',
    instructionType: 'CloseUpgradeProcess',
    name: 'Close Upgrade Process',
    category: 'starbase',
    description: 'Close upgrade process'
  },

  // Advanced Cargo & Fleet Management
  'ForceDropFleetCargo': {
    program: 'SAGE-Starbased',
    instructionType: 'ForceDropFleetCargo',
    name: 'Force Drop Cargo',
    category: 'cargo',
    description: 'Force drop fleet cargo'
  },
  'RemoveInvalidShipEscrow': {
    program: 'SAGE-Starbased',
    instructionType: 'RemoveInvalidShipEscrow',
    name: 'Remove Invalid Ship',
    category: 'fleet',
    description: 'Remove invalid ship escrow'
  },
  'CloseFleetCargoPodTokenAccount': {
    program: 'SAGE-Starbased',
    instructionType: 'CloseFleetCargoPodTokenAccount',
    name: 'Close Fleet Cargo Pod',
    category: 'cargo',
    description: 'Close fleet cargo pod token account'
  },
  'CloseStarbaseCargoTokenAccount': {
    program: 'SAGE-Starbased',
    instructionType: 'CloseStarbaseCargoTokenAccount',
    name: 'Close Starbase Cargo',
    category: 'starbase',
    description: 'Close starbase cargo token account'
  },

  // Bank Operations
  'DrainMineItemBank': {
    program: 'SAGE-Starbased',
    instructionType: 'DrainMineItemBank',
    name: 'Drain Mine Bank',
    category: 'mining',
    description: 'Drain mine item bank'
  },
  'DrainSurveyDataUnitsBank': {
    program: 'SAGE-Starbased',
    instructionType: 'DrainSurveyDataUnitsBank',
    name: 'Drain SDU Bank',
    category: 'mining',
    description: 'Drain survey data units bank'
  },

  // Game State Management
  'ActivateGameState': {
    program: 'SAGE-Starbased',
    instructionType: 'ActivateGameState',
    name: 'Activate Game State',
    category: 'game',
    description: 'Activate game state'
  },
  'CopyGameState': {
    program: 'SAGE-Starbased',
    instructionType: 'CopyGameState',
    name: 'Copy Game State',
    category: 'game',
    description: 'Copy game state'
  },

  // Default for unknown instructions
  'Unknown': {
    program: 'SAGE-Starbased',
    instructionType: 'Unknown',
    name: 'Unknown Operation',
    category: 'unknown',
    description: 'Unknown SAGE operation'
  }
};

// Map crafting instruction types




/**
 * Extract a material type from instruction name or log
 */
export function extractMaterialType(instruction: DecodedInstruction | undefined, logs?: string[]): string | undefined {
  if (!instruction) return undefined;

  // Check instruction name for material hints
  const ixName = instruction.name.toLowerCase();
  if (/ore/i.test(ixName)) return 'Ore';
  if (/fuel/i.test(ixName)) return 'Fuel';
  if (/food/i.test(ixName)) return 'Food';
  if (/ammo/i.test(ixName)) return 'Ammo';
  if (/tool/i.test(ixName)) return 'Tool';
  if (/component/i.test(ixName)) return 'Component';

  // Check logs if provided
  if (logs) {
    const logStr = logs.join(' ').toLowerCase();
    if (/ore/i.test(logStr)) return 'Ore';
    if (/fuel/i.test(logStr)) return 'Fuel';
    if (/food/i.test(logStr)) return 'Food';
    if (/ammo/i.test(logStr)) return 'Ammo';
    if (/tool/i.test(logStr)) return 'Tool';
    if (/component/i.test(logStr)) return 'Component';
  }

  return undefined;
}

/**
 * Decode an account using the Rust binary
 */
export async function decodeAccount(data: Buffer | Uint8Array): Promise<any | null> {
  try {
    return decodeAccountWithRust(data);
  } catch (e) {
    return null;
  }
}

export default {
  decodeInstructionFromLogs,
  extractMaterialType,
  decodeAccount
};
