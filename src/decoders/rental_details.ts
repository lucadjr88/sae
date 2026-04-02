// rental_details.ts
// Modulo per ottenere dettagli aggiuntivi di una rental fleet da Star Atlas
// Funzione minimale: solo firma e struttura base


import { PublicKey, Connection } from '@solana/web3.js';
import { deserialize } from 'borsh';
import { getRpcConnection } from '../utils/rpc/connection.js';

export interface RentalFleetDetails {
  crew?: number;
  fuelLevel?: number;
  fuelCapacity?: number;
  ammoLevel?: number;
  ammoCapacity?: number;
  cargoLevel?: number;
  cargoCapacity?: number;
  position?: { sector: [number, number] } | null;
}

// Borsh v2: schema come oggetto JS
const FleetSchema = {
  struct: {
    version: 'u8',
    game_id: { array: { type: 'u8', len: 32 } },
    owner_profile: { array: { type: 'u8', len: 32 } },
    fleet_ships: { array: { type: 'u8', len: 32 } },
    sub_profile: { array: { type: 'u8', len: 32 } },
    sub_profile_invalidator: { array: { type: 'u8', len: 32 } },
    faction: 'u8',
    fleet_label: { array: { type: 'u8', len: 32 } },
    // ship_counts skipped
    warp_cooldown_expires_at: 'i64',
    scan_cooldown_expires_at: 'i64',
    // stats skipped
    cargo_hold: { array: { type: 'u8', len: 32 } },
    fuel_tank: { array: { type: 'u8', len: 32 } },
    ammo_bank: { array: { type: 'u8', len: 32 } },
    update_id: 'u64',
    bump: 'u8',
    // fleet_state skipped
  },
};

// Program ID SAGE Starbased (mainnet)
export const SAGE_STARBASED_PROGRAM_ID = new PublicKey('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE');

export async function getRentalFleetDetails(
  fleetId: PublicKey,
  contractId: PublicKey,
  connection?: Connection
): Promise<RentalFleetDetails> {
  const conn = connection ?? await getRpcConnection();

  // Fetch account Fleet
  const accInfo = await conn.getAccountInfo(fleetId);
  if (!accInfo) throw new Error('Fleet account not found');

  // Decodifica minima con borsh
  const fleet = deserialize(FleetSchema, accInfo.data.slice(8)); // skip discriminator

  // NOTA: qui estraiamo solo i dati base, senza fetch di pod/ship multipli
  // Per demo: restituiamo solo posizione null e nessun livello
  return {
    crew: undefined, // richiede fetch ship multipli
    fuelLevel: undefined, // richiede fetch pod
    fuelCapacity: undefined, // richiede fetch ship multipli
    ammoLevel: undefined, // richiede fetch pod
    ammoCapacity: undefined, // richiede fetch ship multipli
    cargoLevel: undefined, // richiede fetch pod
    cargoCapacity: undefined, // richiede fetch ship multipli
    position: null, // richiede decodifica FleetState
  };
}
