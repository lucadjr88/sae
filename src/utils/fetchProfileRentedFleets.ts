import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager';
import fs from 'fs/promises';
import path from 'path';

// Fetch rented fleets (contracts) associated to a profileId using getProgramAccounts + memcmp
export async function fetchProfileRentedFleets(profileId: string): Promise<any[]> {
  const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
  const OWNER_PROFILE_OFFSET = 195; // discriminator(8)+version(1)+to_close(1)+rate(8)+dur_min(8)+dur_max(8)+payments_freq(1)+fleet(32)+game_id(32)+current_rental_state(32)+owner(32)+owner_token_account(32)
  let pick: any = null;
  try {
    pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 2000 });
    const { connection, release } = pick;
    const programPubkey = new PublicKey(SRSLY_PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(programPubkey, {
      filters: [ { memcmp: { offset: OWNER_PROFILE_OFFSET, bytes: profileId } } ],
      commitment: 'confirmed'
    });

    function readPubkey(buf: Buffer, off: number) {
      return new PublicKey(buf.slice(off, off + 32)).toBase58();
    }

    function readI64(buf: Buffer, off: number) {
      return Number(buf.readBigInt64LE(off));
    }

    function readU64(buf: Buffer, off: number) {
      return buf.readBigUInt64LE(off).toString();
    }

    function parseContractState(data: Buffer) {
      const DISC_LEN = 8;
      if (data.length <= DISC_LEN) return null;
      let off = DISC_LEN;
      const version = data.readUInt8(off); off += 1;
      const to_close = !!data.readUInt8(off); off += 1;
      const rate = readU64(data, off); off += 8;
      const duration_min = readU64(data, off); off += 8;
      const duration_max = readU64(data, off); off += 8;
      const payments_freq_idx = data.readUInt8(off); off += 1;
      const payments_freq = payments_freq_idx;
      const fleet = readPubkey(data, off); off += 32;
      const game_id = readPubkey(data, off); off += 32;
      const current_rental_state = readPubkey(data, off); off += 32;
      const owner = readPubkey(data, off); off += 32;
      const owner_token_account = readPubkey(data, off); off += 32;
      const owner_profile = readPubkey(data, off); off += 32;
      const bump = data.readUInt8(off); off += 1;

      return { version, to_close, rate, duration_min, duration_max, payments_freq, fleet, game_id, current_rental_state, owner, owner_token_account, owner_profile, bump, raw: data.toString('base64'), pubkey: undefined as any, fleetData: undefined as any };
    }
    const rented: any[] = [];
    // prepare cache dirs
    const rentedCacheDir = path.join(process.cwd(), 'cache', profileId, 'rented-fleets');
    const fleetsCacheDir = path.join(process.cwd(), 'cache', profileId, 'fleets');
    await fs.mkdir(rentedCacheDir, { recursive: true });
    await fs.mkdir(fleetsCacheDir, { recursive: true });

    for (const acct of accounts) {
      const data: Buffer = acct.account?.data instanceof Buffer ? acct.account.data : Buffer.from(acct.account.data);
      const parsed = parseContractState(data);
      if (!parsed) continue;
      parsed.pubkey = acct.pubkey.toBase58();
      // try to fetch the referenced fleet account and parse full fleet info
      try {
        const fleetAcc = await connection.getAccountInfo(new PublicKey(parsed.fleet));
        if (fleetAcc && fleetAcc.data) {
          // parse fleet data (reuse parse logic similar to fetchProfileFleets)
          function parseFleet(dataBuf: Buffer) {
            const DISC_LEN = 8;
            if (dataBuf.length <= DISC_LEN) return null;
            let off = DISC_LEN;
            const version = dataBuf.readUInt8(off); off += 1;
            const game_id = readPubkey(dataBuf, off); off += 32;
            const owner_profile = readPubkey(dataBuf, off); off += 32;
            const fleet_ships = readPubkey(dataBuf, off); off += 32;
            const sub_profile = readPubkey(dataBuf, off); off += 32;
            const sub_profile_invalidator = readPubkey(dataBuf, off); off += 32;
            const faction = dataBuf.readUInt8(off); off += 1;
            const fleet_label = dataBuf.slice(off, off + 32).toString('utf8').replace(/\0+$/g, ''); off += 32;
            const total = dataBuf.readUInt32LE(off); off += 4;
            const updated = dataBuf.readUInt32LE(off); off += 4;
            const xx_small = dataBuf.readUInt16LE(off); off += 2;
            const x_small = dataBuf.readUInt16LE(off); off += 2;
            const small = dataBuf.readUInt16LE(off); off += 2;
            const medium = dataBuf.readUInt16LE(off); off += 2;
            const large = dataBuf.readUInt16LE(off); off += 2;
            const capital = dataBuf.readUInt16LE(off); off += 2;
            const commander = dataBuf.readUInt16LE(off); off += 2;
            const titan = dataBuf.readUInt16LE(off); off += 2;
            const ship_counts = { total, updated, xx_small, x_small, small, medium, large, capital, commander, titan };
            const warp_cooldown_expires_at = readI64(dataBuf, off); off += 8;
            const scan_cooldown_expires_at = readI64(dataBuf, off); off += 8;
            const subwarp_speed = dataBuf.readUInt32LE(off); off += 4;
            const warp_speed = dataBuf.readUInt32LE(off); off += 4;
            const max_warp_distance = dataBuf.readUInt16LE(off); off += 2;
            const warp_cool_down = dataBuf.readUInt16LE(off); off += 2;
            const subwarp_fuel_consumption_rate = dataBuf.readUInt32LE(off); off += 4;
            const warp_fuel_consumption_rate = dataBuf.readUInt32LE(off); off += 4;
            const planet_exit_fuel_amount = dataBuf.readUInt32LE(off); off += 4;
            const movement_stats = { subwarp_speed, warp_speed, max_warp_distance, warp_cool_down, subwarp_fuel_consumption_rate, warp_fuel_consumption_rate, planet_exit_fuel_amount };
            const cargo_capacity = dataBuf.readUInt32LE(off); off += 4;
            const fuel_capacity = dataBuf.readUInt32LE(off); off += 4;
            const ammo_capacity = dataBuf.readUInt32LE(off); off += 4;
            const ammo_consumption_rate = dataBuf.readUInt32LE(off); off += 4;
            const food_consumption_rate = dataBuf.readUInt32LE(off); off += 4;
            const mining_rate = dataBuf.readUInt32LE(off); off += 4;
            const upgrade_rate = dataBuf.readUInt32LE(off); off += 4;
            const cargo_transfer_rate = dataBuf.readUInt32LE(off); off += 4;
            const tractor_beam_gather_rate = dataBuf.readUInt32LE(off); off += 4;
            const cargo_stats = { cargo_capacity, fuel_capacity, ammo_capacity, ammo_consumption_rate, food_consumption_rate, mining_rate, upgrade_rate, cargo_transfer_rate, tractor_beam_gather_rate };
            const required_crew = dataBuf.readUInt16LE(off); off += 2;
            const passenger_capacity = dataBuf.readUInt16LE(off); off += 2;
            const crew_count = dataBuf.readUInt16LE(off); off += 2;
            const rented_crew = dataBuf.readUInt16LE(off); off += 2;
            const respawn_time = dataBuf.readUInt16LE(off); off += 2;
            const scan_cool_down = dataBuf.readUInt16LE(off); off += 2;
            const sdu_per_scan = dataBuf.readUInt32LE(off); off += 4;
            const scan_cost = dataBuf.readUInt32LE(off); off += 4;
            const placeholder = dataBuf.readUInt32LE(off); off += 4;
            const placeholder2 = dataBuf.readUInt32LE(off); off += 4;
            const placeholder3 = dataBuf.readUInt32LE(off); off += 4;
            const misc_stats = { required_crew, passenger_capacity, crew_count, rented_crew, respawn_time, scan_cool_down, sdu_per_scan, scan_cost, placeholder, placeholder2, placeholder3 };
            const stats = { movement_stats, cargo_stats, misc_stats };
            const cargo_hold = readPubkey(dataBuf, off); off += 32;
            const fuel_tank = readPubkey(dataBuf, off); off += 32;
            const ammo_bank = readPubkey(dataBuf, off); off += 32;
            const update_id = readU64(dataBuf, off); off += 8;
            const bump = dataBuf.readUInt8(off); off += 1;
            // FleetState enum (variant index then variant data)
            let fleet_state: any = null;
            if (off < dataBuf.length) {
              const variant = dataBuf.readUInt8(off); off += 1;
              switch (variant) {
                case 0: {
                  const starbase = readPubkey(dataBuf, off); off += 32;
                  const last_update = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'StarbaseLoadingBay', starbase, last_update };
                  break;
                }
                case 1: {
                  const sector0 = readI64(dataBuf, off); off += 8;
                  const sector1 = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'Idle', sector: [sector0, sector1] };
                  break;
                }
                case 2: {
                  const asteroid = readPubkey(dataBuf, off); off += 32;
                  const resource = readPubkey(dataBuf, off); off += 32;
                  const start = readI64(dataBuf, off); off += 8;
                  const end = readI64(dataBuf, off); off += 8;
                  const amount_mined = dataBuf.readBigUInt64LE(off).toString(); off += 8;
                  const last_update = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'MineAsteroid', asteroid, resource, start, end, amount_mined, last_update };
                  break;
                }
                case 3: {
                  const from0 = readI64(dataBuf, off); off += 8;
                  const from1 = readI64(dataBuf, off); off += 8;
                  const to0 = readI64(dataBuf, off); off += 8;
                  const to1 = readI64(dataBuf, off); off += 8;
                  const warp_start = readI64(dataBuf, off); off += 8;
                  const warp_finish = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'MoveWarp', from_sector: [from0, from1], to_sector: [to0, to1], warp_start, warp_finish };
                  break;
                }
                case 4: {
                  const from0 = readI64(dataBuf, off); off += 8;
                  const from1 = readI64(dataBuf, off); off += 8;
                  const to0 = readI64(dataBuf, off); off += 8;
                  const to1 = readI64(dataBuf, off); off += 8;
                  const current0 = readI64(dataBuf, off); off += 8;
                  const current1 = readI64(dataBuf, off); off += 8;
                  const departure_time = readI64(dataBuf, off); off += 8;
                  const arrival_time = readI64(dataBuf, off); off += 8;
                  const fuel_expenditure = dataBuf.readBigUInt64LE(off).toString(); off += 8;
                  const last_update = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'MoveSubwarp', from_sector: [from0, from1], to_sector: [to0, to1], current_sector: [current0, current1], departure_time, arrival_time, fuel_expenditure, last_update };
                  break;
                }
                case 5: {
                  const s0 = readI64(dataBuf, off); off += 8;
                  const s1 = readI64(dataBuf, off); off += 8;
                  const start = readI64(dataBuf, off); off += 8;
                  fleet_state = { type: 'Respawn', sector: [s0, s1], start };
                  break;
                }
                default: {
                  fleet_state = { type: 'Unknown', raw: dataBuf.slice(off).toString('base64') };
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
              raw: dataBuf.toString('base64')
            };
          }
          const fleetParsed = parseFleet(Buffer.from(fleetAcc.data));
          if (fleetParsed) {
            fleetParsed.pubkey = parsed.fleet;
            parsed.fleetData = fleetParsed;
            // save fleet into cache/<profileId>/fleets/<fleetpubkey>.json
            try {
              const ffile = path.join(fleetsCacheDir, `${parsed.fleet}.json`);
              await fs.writeFile(ffile, JSON.stringify(fleetParsed, null, 2), 'utf8');
            } catch (wfErr) {
              console.error(`[fetchProfileRentedFleets] Failed writing fleet ${parsed.fleet}: ${wfErr}`);
            }
          }
        }
      } catch (fleetErr) {
        console.error(`[fetchProfileRentedFleets] Failed fetching fleet ${parsed.fleet}: ${fleetErr}`);
      }
      // save rented contract
      try {
        const file = path.join(rentedCacheDir, `${parsed.pubkey}.json`);
        await fs.writeFile(file, JSON.stringify(parsed, null, 2), 'utf8');
      } catch (wfErr) {
        console.error(`[fetchProfileRentedFleets] Failed writing ${parsed.pubkey}: ${wfErr}`);
      }
      rented.push(parsed);
    }

    release({ success: true, latencyMs: 0 });
    return rented;
  } catch (e: any) {
    if (pick && pick.release) {
      const errMsg = String(e.message || e || '');
      const is429 = /429|Too Many Requests/i.test(errMsg);
      try { pick.release({ success: false, errorType: is429 ? '429' : 'error' }); } catch {}
    }
    return [];
  }
}

export default fetchProfileRentedFleets;
