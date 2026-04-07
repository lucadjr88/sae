// Decoder di esempio per Fuel (placeholder fedele a struttura Rust/TS)
export function decodeFuel(rawData: Uint8Array): any {
  if (!rawData || rawData.length < 118) return null;
  // Estrarre tutti i campi noti (offset da adattare se cambia layout)
  // Esempio: version (byte 0), fuel_level (offset 110)
  return {
    version: rawData[0],
    // authority: new PublicKey(rawData.slice(1, 33)).toBase58(), // decommenta se serve
    // ... altri campi se noti
    fuel_level: Number(new DataView(rawData.buffer, rawData.byteOffset + 110, 8).getBigUint64(0, true)),
  };
}

// Placeholder decoder per Cargo, Ammo, Crew (da implementare secondo layout reale)
export function decodeCargo(rawData: Uint8Array): any { return null; }
export function decodeAmmo(rawData: Uint8Array): any { return null; }
export function decodeCrew(rawData: Uint8Array): any { return null; }
import { PublicKey } from '@solana/web3.js';

import type { FleetStarbase } from './types.js';

export const CONTRACT_DISCRIMINATOR = Uint8Array.from([
  0xbe, 0x8a, 0x0a, 0xdf, 0xbd, 0x74, 0xde, 0x73,
]);
export const RENTAL_DISCRIMINATOR = Uint8Array.from([
  0x61, 0xa2, 0x1d, 0xde, 0xfb, 0xfb, 0xb4, 0xf4,
]);
export const FLEET_DISCRIMINATOR = Uint8Array.from([
  0x6d, 0xcf, 0xfb, 0x30, 0x6a, 0x02, 0x88, 0xa3,
]);

export const DEFAULT_NULL_PUBKEY = '11111111111111111111111111111111';

const PAYMENT_FREQUENCIES = [
  'Decasecond', 'Minute', 'Hourly', 'Daily', 'Weekly', 'Monthly',
] as const;

const FACTION_TO_STARBASE: Partial<Record<number, FleetStarbase>> = {
  1: 'mud',
  2: 'oni',
  3: 'ustur',
};

export interface DecodedContractState {
  version: number;
  to_close: boolean;
  rate: number;
  duration_min: number;
  duration_max: number;
  payment_frequency: string;
  fleet: string;
  game_id: string;
  current_rental_state: string | null;
  owner: string;
  owner_token_account: string;
  owner_profile: string;
  bump: number;
}

export interface DecodedRentalState {
  version: number;
  borrower: string;
  thread: string;
  contract: string;
  owner_token_account: string;
  rate: number;
  start_time: number;
  end_time: number;
  cancelled: boolean;
  bump: number;
}

export interface DecodedFleetMeta {
  faction?: number;
  starbase?: FleetStarbase;
  fleet_name?: string;
  fleet_ships?: string;
}

export interface FleetShipEntry {
  ship_mint: string;
  amount: number;
}

function hasDiscriminator(data: Uint8Array, discriminator: Uint8Array): boolean {
  if (data.length < discriminator.length) return false;
  for (let i = 0; i < discriminator.length; i += 1) {
    if (data[i] !== discriminator[i]) return false;
  }
  return true;
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
}

function readI64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true);
}

function readF64(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, true);
}

function readBool(data: Uint8Array, offset: number): boolean {
  return data[offset] === 1;
}

function readPubkey(data: Uint8Array, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function readFixedUtf8(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.subarray(offset, offset + length);
  const end = bytes.findIndex((b) => b === 0);
  const content = end >= 0 ? bytes.subarray(0, end) : bytes;
  return new TextDecoder().decode(content).trim();
}

function toSafeNumber(value: bigint): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapFactionToStarbase(faction: number): FleetStarbase | undefined {
  return FACTION_TO_STARBASE[faction];
}

export function decodeContractState(rawData: Uint8Array): DecodedContractState | null {
  if (!hasDiscriminator(rawData, CONTRACT_DISCRIMINATOR)) return null;
  if (rawData.length < 228) return null;

  const paymentIndex = rawData[34] ?? 0;
  const currentRentalState = readPubkey(rawData, 99);

  return {
    version: rawData[8] ?? 0,
    to_close: readBool(rawData, 9),
    rate: toSafeNumber(readU64(rawData, 10)),
    duration_min: toSafeNumber(readU64(rawData, 18)),
    duration_max: toSafeNumber(readU64(rawData, 26)),
    payment_frequency: PAYMENT_FREQUENCIES[paymentIndex] ?? 'Unknown',
    fleet: readPubkey(rawData, 35),
    game_id: readPubkey(rawData, 67),
    current_rental_state: currentRentalState === DEFAULT_NULL_PUBKEY ? null : currentRentalState,
    owner: readPubkey(rawData, 131),
    owner_token_account: readPubkey(rawData, 163),
    owner_profile: readPubkey(rawData, 195),
    bump: rawData[227] ?? 0,
  };
}

export function decodeRentalState(rawData: Uint8Array): DecodedRentalState | null {
  if (!hasDiscriminator(rawData, RENTAL_DISCRIMINATOR)) return null;
  if (rawData.length < 163) return null;

  const rateAsFloat = readF64(rawData, 137);
  const rateAsInteger = toSafeNumber(readI64(rawData, 137));
  const rate =
    Number.isFinite(rateAsFloat) && Math.abs(rateAsFloat) < 1_000_000_000_000
      ? rateAsFloat
      : rateAsInteger;

  return {
    version: rawData[8] ?? 0,
    borrower: readPubkey(rawData, 9),
    thread: readPubkey(rawData, 41),
    contract: readPubkey(rawData, 73),
    owner_token_account: readPubkey(rawData, 105),
    rate,
    start_time: toSafeNumber(readI64(rawData, 145)),
    end_time: toSafeNumber(readI64(rawData, 153)),
    cancelled: readBool(rawData, 161),
    bump: rawData[162] ?? 0,
  };
}

export function decodeFleetMeta(rawData: Uint8Array): DecodedFleetMeta | null {
  if (!hasDiscriminator(rawData, FLEET_DISCRIMINATOR)) return null;

  const meta: DecodedFleetMeta = {};

  if (rawData.length >= 170) {
    const faction = rawData[169];
    if (typeof faction === 'number') {
      meta.faction = faction;
      const starbase = mapFactionToStarbase(faction);
      if (starbase) meta.starbase = starbase;
    }
  }

  if (rawData.length >= 202) {
    const label = readFixedUtf8(rawData, 170, 32);
    if (label) meta.fleet_name = label;
  }

  if (rawData.length >= 105) {
    meta.fleet_ships = readPubkey(rawData, 73);
  }

  if (!meta.fleet_name && !meta.fleet_ships) return null;
  return meta;
}

export function decodeFleetShipsEntries(rawData: Uint8Array): FleetShipEntry[] {
  if (rawData.length < 46) return [];

  const infoCount = readU32(rawData, 42);
  const entries: FleetShipEntry[] = [];
  let offset = 46;

  for (let i = 0; i < infoCount; i += 1) {
    if (offset + 48 > rawData.length) break;
    entries.push({
      ship_mint: readPubkey(rawData, offset),
      amount: toSafeNumber(readU64(rawData, offset + 32)),
    });
    offset += 48;
  }

  return entries;
}

export function decodeShipName(rawData: Uint8Array): string | null {
  if (rawData.length < 137) return null;
  return readFixedUtf8(rawData, 73, 64) || null;
}
