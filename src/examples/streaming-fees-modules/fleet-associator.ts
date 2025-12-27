import { TransactionInfo } from '../types.js';
import { FleetAssociatorInput, FleetAssociatorOutput } from './interfaces.js';

/**
 * FleetAssociator - Modulo per associazione transazione-fleet
 *
 * Responsabilità: Associare transazioni a flotte specifiche attraverso matching
 * di account keys, con fallback per operazioni cargo e categorizzazione
 * per operazioni non-fleet.
 */
export async function associateFleet(input: FleetAssociatorInput): Promise<FleetAssociatorOutput> {
  const { transaction, operation, fleetAccounts, fleetAccountNames, excludeAccounts } = input;

  let involvedFleetName: string | undefined;
  let involvedFleetAccount: string | undefined;

  // Debug for Subwarp
  if (operation.includes('Subwarp')) {
    console.log(`[DEBUG Subwarp] Operation: ${operation}, Signature: ${transaction.signature}`);
    console.log(`[DEBUG Subwarp] AccountKeys: ${transaction.accountKeys}`);
    console.log(`[DEBUG Subwarp] FleetAccounts length: ${fleetAccounts.length}`);
    console.log(`[DEBUG Subwarp] FleetAccountNames keys: ${Object.keys(fleetAccountNames)}`);
  }

  // Prima priorità: match diretto con fleet accounts
  for (const fleet of fleetAccounts) {
    if (transaction.accountKeys && transaction.accountKeys.includes(fleet)) {
      involvedFleetName = fleetAccountNames[fleet] || fleet.substring(0, 8);
      involvedFleetAccount = fleet;
      if (operation.includes('Subwarp')) {
        console.log(`[DEBUG Subwarp] Found in direct match: ${fleet}`);
      }
      break;
    }
  }

  // Seconda priorità: per operazioni cargo/dock/movement, cerca nei fleetAccountNames
  if (!involvedFleetName && isCargoOrDockOrMovementOperation(operation)) {
    if (transaction.accountKeys) {
      for (const acc of transaction.accountKeys) {
        if (fleetAccountNames[acc]) {
          involvedFleetName = fleetAccountNames[acc];
          involvedFleetAccount = acc;
          if (operation.includes('Subwarp')) {
            console.log(`[DEBUG Subwarp] Found in fleetAccountNames: ${acc} -> ${involvedFleetName}`);
          }
          break;
        }
      }
    }

    // Fallback: usa il primo fleet disponibile come primary
    if (!involvedFleetName && fleetAccounts.length > 0) {
      const primaryFleet = fleetAccounts[0];
      involvedFleetName = fleetAccountNames[primaryFleet] || primaryFleet.substring(0, 8);
      involvedFleetAccount = primaryFleet;
      if (operation.includes('Subwarp')) {
        console.log(`[DEBUG Subwarp] Using primary fleet fallback: ${primaryFleet}`);
      }
    }
  }

  // Terza priorità: categorizzazione per operazioni non-fleet
  if (!involvedFleetName) {
    const category = categorizeOperation(operation);
    involvedFleetName = category;
    involvedFleetAccount = undefined; // Nessun account specifico per categorie
    if (operation.includes('Subwarp')) {
      console.log(`[DEBUG Subwarp] Categorized as: ${category}`);
    }
  }

  if (operation.includes('Subwarp')) {
    console.log(`[DEBUG Subwarp] Final result: fleetName=${involvedFleetName}, fleetAccount=${involvedFleetAccount}`);
  }

  return {
    involvedFleetName,
    involvedFleetAccount
  };
}

/**
 * Determina se un'operazione è di tipo cargo, dock o movement (fleet operations)
 */
function isCargoOrDockOrMovementOperation(operation: string): boolean {
  const groupedOperation = getGroupedOperation(operation);
  return groupedOperation === 'Dock/Undock/Load/Unload' ||
         operation.includes('Cargo') ||
         operation.includes('cargo') ||
         isMovementOperation(operation);
}

/**
 * Determina se un'operazione è di movimento/spostamento flotta
 */
function isMovementOperation(operation: string): boolean {
  return operation.includes('Subwarp') ||
         operation.includes('Warp') ||
         operation.includes('Move') ||
         operation === 'StartSubwarp' ||
         operation === 'StopSubwarp' ||
         operation === 'WarpToCoordinate' ||
         operation === 'WarpLane';
}

/**
 * Raggruppa operazioni simili (logica estratta dall'originale)
 */
function getGroupedOperation(operation: string): string {
  // Questa è una semplificazione - nell'originale c'è più logica
  // ma per l'associazione fleet ci serve solo identificare cargo/dock
  if (operation.includes('Dock') || operation.includes('Undock') ||
      operation.includes('Load') || operation.includes('Unload')) {
    return 'Dock/Undock/Load/Unload';
  }
  if (isMovementOperation(operation)) {
    return 'Movement/Warp';
  }
  return operation;
}

/**
 * Categorizza operazioni non associate a fleet specifica
 */
function categorizeOperation(operation: string): string {
  if (operation.includes('Craft') || operation.includes('crafting')) {
    return 'Crafting Operations';
  } else if (operation.includes('Starbase')) {
    return 'Starbase Operations';
  } else if (operation.includes('Register') || operation.includes('Deregister') ||
             operation.includes('Update') || operation.includes('Init')) {
    return 'Configuration';
  } else if (operation.includes('Profile') || operation.includes('Progression') ||
             operation.includes('Points')) {
    return 'Player Profile';
  } else if (operation.includes('Rental')) {
    return 'Fleet Rentals';
  } else if (operation.includes('Sector') || operation.includes('Planet') ||
             operation.includes('Star')) {
    return 'Universe Management';
  } else {
    // Default per qualsiasi altra operazione SAGE
    return 'Other Operations';
  }
}