
import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager';
import fs from 'fs/promises';
import path from 'path';

// Fetch fleets associated to a profileId using getProgramAccounts + memcmp
export async function fetchProfileFleets(profileId: string): Promise<any[]> {
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const OWNER_PROFILE_OFFSET = 41; // 8 (disc) +1(version) +32(game_id)
  let pick: any = null;
  try {
    pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
    const { connection, release } = pick;
    // call getProgramAccounts with memcmp on owner_profile
    const programPubkey = new PublicKey(SAGE_PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(programPubkey, {
      filters: [
        { memcmp: { offset: OWNER_PROFILE_OFFSET, bytes: profileId } }
      ],
      commitment: 'confirmed'
    });
    // decode full Fleet via manual Borsh-style parser
    function readPubkey(buf: Buffer, off: number) {
      return new PublicKey(buf.slice(off, off + 32)).toBase58();
    }

    function readI64(buf: Buffer, off: number) {
      return Number(buf.readBigInt64LE(off));
    }

    function readU64(buf: Buffer, off: number) {
      return buf.readBigUInt64LE(off).toString();
    }

    function parseFleet(data: Buffer) {
      // data includes the full account.data bytes (with discriminator at start)
      const DISC_LEN = 8;
      if (data.length <= DISC_LEN) return null;
      let off = DISC_LEN;
      const version = data.readUInt8(off); off += 1;
      const game_id = readPubkey(data, off); off += 32;
      const owner_profile = readPubkey(data, off); off += 32;
      const fleet_ships = readPubkey(data, off); off += 32;
      // OptionalNonSystemPubkey: here it's represented as a Pubkey
      const sub_profile = readPubkey(data, off); off += 32;
      const sub_profile_invalidator = readPubkey(data, off); off += 32;
      const faction = data.readUInt8(off); off += 1;
      const fleet_label = data.slice(off, off + 32).toString('utf8').replace(/\0+$/g, ''); off += 32;
      // ShipCounts
      const total = data.readUInt32LE(off); off += 4;
      const updated = data.readUInt32LE(off); off += 4;
      const xx_small = data.readUInt16LE(off); off += 2;
      const x_small = data.readUInt16LE(off); off += 2;
      const small = data.readUInt16LE(off); off += 2;
      const medium = data.readUInt16LE(off); off += 2;
      const large = data.readUInt16LE(off); off += 2;
      const capital = data.readUInt16LE(off); off += 2;
      const commander = data.readUInt16LE(off); off += 2;
      const titan = data.readUInt16LE(off); off += 2;
      const ship_counts = { total, updated, xx_small, x_small, small, medium, large, capital, commander, titan };
      const warp_cooldown_expires_at = readI64(data, off); off += 8;
      const scan_cooldown_expires_at = readI64(data, off); off += 8;
      // ShipStats -> MovementStats
      const subwarp_speed = data.readUInt32LE(off); off += 4;
      const warp_speed = data.readUInt32LE(off); off += 4;
      const max_warp_distance = data.readUInt16LE(off); off += 2;
      const warp_cool_down = data.readUInt16LE(off); off += 2;
      const subwarp_fuel_consumption_rate = data.readUInt32LE(off); off += 4;
      const warp_fuel_consumption_rate = data.readUInt32LE(off); off += 4;
      const planet_exit_fuel_amount = data.readUInt32LE(off); off += 4;
      const movement_stats = { subwarp_speed, warp_speed, max_warp_distance, warp_cool_down, subwarp_fuel_consumption_rate, warp_fuel_consumption_rate, planet_exit_fuel_amount };
      // CargoStats
      const cargo_capacity = data.readUInt32LE(off); off += 4;
      const fuel_capacity = data.readUInt32LE(off); off += 4;
      const ammo_capacity = data.readUInt32LE(off); off += 4;
      const ammo_consumption_rate = data.readUInt32LE(off); off += 4;
      const food_consumption_rate = data.readUInt32LE(off); off += 4;
      const mining_rate = data.readUInt32LE(off); off += 4;
      const upgrade_rate = data.readUInt32LE(off); off += 4;
      const cargo_transfer_rate = data.readUInt32LE(off); off += 4;
      const tractor_beam_gather_rate = data.readUInt32LE(off); off += 4;
      const cargo_stats = { cargo_capacity, fuel_capacity, ammo_capacity, ammo_consumption_rate, food_consumption_rate, mining_rate, upgrade_rate, cargo_transfer_rate, tractor_beam_gather_rate };
      // MiscStats
      const required_crew = data.readUInt16LE(off); off += 2;
      const passenger_capacity = data.readUInt16LE(off); off += 2;
      const crew_count = data.readUInt16LE(off); off += 2;
      const rented_crew = data.readUInt16LE(off); off += 2;
      const respawn_time = data.readUInt16LE(off); off += 2;
      const scan_cool_down = data.readUInt16LE(off); off += 2;
      const sdu_per_scan = data.readUInt32LE(off); off += 4;
      const scan_cost = data.readUInt32LE(off); off += 4;
      const placeholder = data.readUInt32LE(off); off += 4;
      const placeholder2 = data.readUInt32LE(off); off += 4;
      const placeholder3 = data.readUInt32LE(off); off += 4;
      const misc_stats = { required_crew, passenger_capacity, crew_count, rented_crew, respawn_time, scan_cool_down, sdu_per_scan, scan_cost, placeholder, placeholder2, placeholder3 };
      const stats = { movement_stats, cargo_stats, misc_stats };
      const cargo_hold = readPubkey(data, off); off += 32;
      const fuel_tank = readPubkey(data, off); off += 32;
      const ammo_bank = readPubkey(data, off); off += 32;
      const update_id = readU64(data, off); off += 8;
      const bump = data.readUInt8(off); off += 1;
      // FleetState enum (variant index then variant data)
      let fleet_state: any = null;
      if (off < data.length) {
        const variant = data.readUInt8(off); off += 1;
        // 0: StarbaseLoadingBay, 1: Idle, 2: MineAsteroid, 3: MoveWarp, 4: MoveSubwarp, 5: Respawn
        switch (variant) {
          case 0: {
            const starbase = readPubkey(data, off); off += 32;
            const last_update = readI64(data, off); off += 8;
            fleet_state = { type: 'StarbaseLoadingBay', starbase, last_update };
            break;
          }
          case 1: {
            const sector0 = readI64(data, off); off += 8;
            const sector1 = readI64(data, off); off += 8;
            fleet_state = { type: 'Idle', sector: [sector0, sector1] };
            break;
          }
          case 2: {
            const asteroid = readPubkey(data, off); off += 32;
            const resource = readPubkey(data, off); off += 32;
            const start = readI64(data, off); off += 8;
            const end = readI64(data, off); off += 8;
            const amount_mined = data.readBigUInt64LE(off).toString(); off += 8;
            const last_update = readI64(data, off); off += 8;
            fleet_state = { type: 'MineAsteroid', asteroid, resource, start, end, amount_mined, last_update };
            break;
          }
          case 3: {
            const from0 = readI64(data, off); off += 8;
            const from1 = readI64(data, off); off += 8;
            const to0 = readI64(data, off); off += 8;
            const to1 = readI64(data, off); off += 8;
            const warp_start = readI64(data, off); off += 8;
            const warp_finish = readI64(data, off); off += 8;
            fleet_state = { type: 'MoveWarp', from_sector: [from0, from1], to_sector: [to0, to1], warp_start, warp_finish };
            break;
          }
          case 4: {
            const from0 = readI64(data, off); off += 8;
            const from1 = readI64(data, off); off += 8;
            const to0 = readI64(data, off); off += 8;
            const to1 = readI64(data, off); off += 8;
            const current0 = readI64(data, off); off += 8;
            const current1 = readI64(data, off); off += 8;
            const departure_time = readI64(data, off); off += 8;
            const arrival_time = readI64(data, off); off += 8;
            const fuel_expenditure = data.readBigUInt64LE(off).toString(); off += 8;
            const last_update = readI64(data, off); off += 8;
            fleet_state = { type: 'MoveSubwarp', from_sector: [from0, from1], to_sector: [to0, to1], current_sector: [current0, current1], departure_time, arrival_time, fuel_expenditure, last_update };
            break;
          }
          case 5: {
            const s0 = readI64(data, off); off += 8;
            const s1 = readI64(data, off); off += 8;
            const start = readI64(data, off); off += 8;
            fleet_state = { type: 'Respawn', sector: [s0, s1], start };
            break;
          }
          default: {
            // unknown variant - capture remaining as base64
            fleet_state = { type: 'Unknown', raw: data.slice(off).toString('base64') };
          }
        }
      }

      return {
        version,
        game_id,
        owner_profile,
        fleet_ships,
        sub_profile,
        sub_profile_invalidator,
        faction,
        fleet_label,
        ship_counts,
        warp_cooldown_expires_at,
        scan_cooldown_expires_at,
        stats,
        cargo_hold,
        fuel_tank,
        ammo_bank,
        update_id,
        bump,
        fleet_state,
        pubkey: undefined as any,
        raw: data.toString('base64')
      };
    }

    const fleets: any[] = accounts.map((acct: any) => {
      const data: Buffer = acct.account?.data instanceof Buffer ? acct.account.data : Buffer.from(acct.account.data);
      const parsed = parseFleet(data);
      if (parsed) parsed.pubkey = acct.pubkey.toBase58();
      return parsed;
    }).filter(Boolean);
    // save fleets into cache/<profileId>/fleets/<fleetid>.json
    try {
      const cacheDir = path.join(process.cwd(), 'cache', profileId, 'fleets');
      await fs.mkdir(cacheDir, { recursive: true });
      await Promise.all(fleets.map(async (f: any) => {
        const file = path.join(cacheDir, `${f.pubkey}.json`);
        try {
          await fs.writeFile(file, JSON.stringify(f, null, 2), 'utf8');
        } catch (wfErr) {
          console.error(`[fetchProfileFleets] Failed writing ${file}: ${wfErr}`);
        }
      }));
    } catch (wErr) {
      console.error(`[fetchProfileFleets] Failed creating/writing cache for profile=${profileId}: ${wErr}`);
    }
    release({ success: true, latencyMs: 0 });
    return fleets;
  } catch (e: any) {
    if (pick && pick.release) {
      const errMsg = String(e.message || e || '');
      const is429 = /429|Too Many Requests/i.test(errMsg);
      try { pick.release({ success: false, errorType: is429 ? '429' : 'error' }); } catch {}
    }
    return [];
  }
}
