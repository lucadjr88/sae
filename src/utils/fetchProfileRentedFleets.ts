import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager.js';
import fs from 'fs/promises';
import path from 'path';
import bs58 from 'bs58';
import { getWalletAuthorityUtil } from './getWalletAuthority.js';
import { RENTAL_DISCRIMINATOR, decodeContractState, decodeRentalState } from '../backend/rental/decode.js';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRpcRetryInfo(error: unknown): { errorType: '429' | '503' | 'error'; retryable: boolean; knownBad: boolean } {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (status === 429 || /429|Too Many Requests/i.test(message)) {
    return { errorType: '429', retryable: true, knownBad: false };
  }

  const knownBad =
    /excluded from account secondary indexes|this RPC method unavailable for key/i.test(message) ||
    /jsonrpc_invalid_empty_array/i.test(message);

  const looksLikeRetryableRelayError =
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /408|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message) ||
    /500 Internal Server Error/i.test(message) ||
    /502|503|Service Unavailable|RPC backend not ready/i.test(message) ||
    /"code"\s*:\s*-31001/.test(message) ||
    /"retryable"\s*:\s*"?true"?/i.test(message) ||
    knownBad;

  if (looksLikeRetryableRelayError) {
    return { errorType: '503', retryable: true, knownBad };
  }

  return { errorType: 'error', retryable: false, knownBad: false };
}

async function loadRentedFleetsFromCache(profileId: string): Promise<any[]> {
  const rentedCacheDir = path.join(process.cwd(), 'cache', profileId, 'rented-fleets');
  const files = await fs.readdir(rentedCacheDir).catch(() => []);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  if (jsonFiles.length === 0) return [];
  const loaded = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        const raw = await fs.readFile(path.join(rentedCacheDir, file), 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
  );
  return loaded.filter(Boolean);
}

async function getBorrowerWallets(profileId: string): Promise<string[]> {
  const cacheFile = path.join(process.cwd(), 'cache', profileId, `${profileId}.json`);
  const wallets = new Set<string>();

  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.walletAuthority === 'string' && parsed.walletAuthority) {
      wallets.add(parsed.walletAuthority);
    }
    if (Array.isArray(parsed?.allowedWallets)) {
      for (const wallet of parsed.allowedWallets) {
        if (typeof wallet?.pubkey === 'string' && wallet.pubkey) {
          wallets.add(wallet.pubkey);
        }
      }
    }
  } catch {
    // ignore and fallback to RPC below
  }

  if (wallets.size > 0) {
    return Array.from(wallets);
  }

  try {
    const { allowedWallets } = await getWalletAuthorityUtil(profileId);
    for (const wallet of allowedWallets || []) {
      if (typeof wallet?.pubkey === 'string' && wallet.pubkey) {
        wallets.add(wallet.pubkey);
      }
    }
  } catch {
    // ignore
  }

  return Array.from(wallets);
}

async function clearJsonCacheDir(dir: string) {
  const files = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map((file) => fs.rm(path.join(dir, file), { force: true }))
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchFleetMapByIds(connection: any, fleetIds: string[], rpcName: string, rpcUrl: string): Promise<Map<string, any>> {
  const parsedByFleet = new Map<string, any>();
  const uniqueFleetIds = Array.from(new Set(fleetIds.filter(Boolean)));

  for (const fleetChunk of chunkArray(uniqueFleetIds, 10)) {
    try {
      const infos = await connection.getMultipleAccountsInfo(
        fleetChunk.map((fleetId) => new PublicKey(fleetId)),
        'confirmed'
      );
      fleetChunk.forEach((fleetId, idx) => {
        const fleetAcc = infos[idx];
        if (!fleetAcc?.data) return;
        const parsed = parseFleet(Buffer.from(fleetAcc.data));
        if (!parsed) return;
        parsed.pubkey = fleetId;
        parsedByFleet.set(fleetId, parsed);
      });
    } catch (fleetErr) {
      console.log(`[DEBUG RENTAL] Failed fetching fleet chunk size=${fleetChunk.length} via rpc=${rpcName} url=${rpcUrl}: ${fleetErr}`);
    }
  }

  return parsedByFleet;
}

function readPubkey(buf: Buffer, off: number) {
  return new PublicKey(buf.slice(off, off + 32)).toBase58();
}

function readI64(buf: Buffer, off: number) {
  return Number(buf.readBigInt64LE(off));
}

function readU64(buf: Buffer, off: number) {
  return buf.readBigUInt64LE(off).toString();
}

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

// Fetch fleets actively rented by one of the profile allowed wallets.
export async function fetchProfileRentedFleets(profileId: string): Promise<any[]> {
  const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
  const BORROWER_OFFSET = 9; // discriminator(8)+borrower(32)
  const cached = await loadRentedFleetsFromCache(profileId);
  if (cached.length > 0) {
    console.log(`[DEBUG RENTAL] Serving ${cached.length} rented/owned fleets from cache for profile ${profileId}`);
    return cached;
  }
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId).catch(() => []);
  const maxAttempts = Math.max(5, Math.round((Array.isArray(pool) ? pool.length : 0) * 1.5));
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let pick: any = null;
    try {
      pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 3000, allowStale: attempt > 2 });
      const { connection, release } = pick;
      const rpcName = pick?.endpoint?.name ?? 'unknown';
      const rpcUrl = pick?.endpoint?.url ?? 'n/a';
      const programPubkey = new PublicKey(SRSLY_PROGRAM_ID);
      const rentedCacheDir = path.join(process.cwd(), 'cache', profileId, 'rented-fleets');
      await fs.mkdir(rentedCacheDir, { recursive: true });

      const borrowerWallets = await getBorrowerWallets(profileId);
      const rented: any[] = [];
      const rentalStatesByContract = new Map<string, any>();
      if (borrowerWallets.length > 0) {
        for (const borrower of borrowerWallets) {
          const accounts = await connection.getProgramAccounts(programPubkey, {
            filters: [
              { memcmp: { offset: 0, bytes: bs58.encode(RENTAL_DISCRIMINATOR) } },
              { memcmp: { offset: BORROWER_OFFSET, bytes: borrower } }
            ],
            commitment: 'confirmed'
          });
          for (const acct of accounts) {
            const data: Buffer = acct.account?.data instanceof Buffer ? acct.account.data : Buffer.from(acct.account.data);
            const rentalState = decodeRentalState(data);
            if (!rentalState || rentalState.cancelled) continue;
            rentalStatesByContract.set(rentalState.contract, {
              ...rentalState,
              pubkey: acct.pubkey.toBase58()
            });
          }
        }
        const contractAddresses = Array.from(rentalStatesByContract.keys());
        if (contractAddresses.length > 0) {
          const contractInfos = await connection.getMultipleAccountsInfo(
            contractAddresses.map((address) => new PublicKey(address)),
            'confirmed'
          );
          const activeContracts = contractInfos.map((account, index) => {
            if (!account) return null;
            const contractAddress = contractAddresses[index];
            const rentalState = contractAddress ? rentalStatesByContract.get(contractAddress) : null;
            if (!contractAddress || !rentalState) return null;
            const decoded = decodeContractState(Buffer.from(account.data));
            if (!decoded || decoded.to_close) return null;
            if (!decoded.current_rental_state || decoded.current_rental_state !== rentalState.pubkey) return null;
            return {
              contractAddress,
              contract: decoded,
              rentalState
            };
          }).filter(Boolean) as Array<{ contractAddress: string; contract: any; rentalState: any }>;
          const activeFleetMap = await fetchFleetMapByIds(
            connection,
            activeContracts.map(({ contract }) => contract.fleet),
            rpcName,
            rpcUrl
          );
          for (const { contractAddress, contract, rentalState } of activeContracts) {
            const fleetParsed = activeFleetMap.get(contract.fleet) ?? null;
            const rentedFleet = {
              ...(fleetParsed || {}),
              pubkey: contract.fleet,
              fleet: contract.fleet,
              isRented: true,
              contractPubkey: contractAddress,
              owner: contract.owner,
              owner_profile: contract.owner_profile,
              owner_token_account: contract.owner_token_account,
              current_rental_state: contract.current_rental_state,
              rate: contract.rate,
              duration_min: contract.duration_min,
              duration_max: contract.duration_max,
              payment_frequency: contract.payment_frequency,
              borrower: rentalState.borrower,
              rental_state_pubkey: rentalState.pubkey,
              rental_start_time: rentalState.start_time,
              rental_end_time: rentalState.end_time,
              rental_cancelled: rentalState.cancelled
            };
            rented.push(rentedFleet);
          }
        }
      }

      // PATCH: aggiungi flotte possedute e messe in rent (listed)
      // Offset owner_profile: discriminator(8) + version(1) + game_id(32) = 41
      const OWNER_PROFILE_OFFSET = 41;
      /*console.log('[DEBUG RENTAL] getProgramAccounts owner_profile filter:', {
        offset: OWNER_PROFILE_OFFSET,
        profileId,
        profileIdBase58: profileId,
        profileIdHex: Buffer.from(bs58.decode(profileId)).toString('hex'),
      });*/
      const listedAccounts = await connection.getProgramAccounts(programPubkey, {
        filters: [
          { memcmp: { offset: 195, bytes: profileId } }
        ],
        commitment: 'confirmed'
      });
      const foundFleetIds = [];
      const listedContracts: Array<{ acct: any; contractState: any }> = [];
      for (const acct of listedAccounts) {
        const data: Buffer = acct.account?.data instanceof Buffer ? acct.account.data : Buffer.from(acct.account.data);
        const contractState = decodeContractState(data);
        if (!contractState || contractState.to_close) continue;
        foundFleetIds.push(contractState.fleet);
        listedContracts.push({ acct, contractState });
      }
      const listedFleetMap = await fetchFleetMapByIds(
        connection,
        listedContracts.map(({ contractState }) => contractState.fleet),
        rpcName,
        rpcUrl
      );
      for (const { acct, contractState } of listedContracts) {
        const fleetParsed = listedFleetMap.get(contractState.fleet) ?? null;
        const isLoaned = !!contractState.current_rental_state;
        const ownedFleet = {
          ...(fleetParsed || {}),
          pubkey: contractState.fleet,
          fleet: contractState.fleet,
          isListed: !isLoaned,
          isLoaned,
          isRented: false,
          owner_profile: contractState.owner_profile,
          contractPubkey: acct.pubkey.toBase58(),
          current_rental_state: contractState.current_rental_state,
          rate: contractState.rate,
          duration_min: contractState.duration_min,
          duration_max: contractState.duration_max,
          payment_frequency: contractState.payment_frequency,
        };
        /*console.log('[DEBUG RENTAL][CATALOGAZIONE FLEET]', {
          fleet: contractState.fleet,
          isLoaned,
          isListed: !isLoaned,
          isRented: false,
          current_rental_state: contractState.current_rental_state,
          owner_profile: contractState.owner_profile,
          contractPubkey: acct.pubkey.toBase58(),
        });*/
        rented.push(ownedFleet);
      }
      //console.log('[DEBUG RENTAL] fleetIds trovate tra i contratti owner_profile:', foundFleetIds);

      await clearJsonCacheDir(rentedCacheDir);
      await Promise.all(
        rented.map(async (fleet: any) => {
          const suffix = fleet.isLoaned ? '_loaned' : fleet.isRented ? '' : '_listed';
          const file = path.join(rentedCacheDir, `${fleet.fleet || fleet.pubkey}${suffix}.json`);
          try {
            await fs.writeFile(file, JSON.stringify(fleet, null, 2), 'utf8');
          } catch (wfErr) {
            console.log(`[DEBUG RENTAL] Failed writing ${fleet.fleet || fleet.pubkey}: ${wfErr}`);
          }
        })
      );

      release({ success: true, latencyMs: 0 });
      console.log(`[DEBUG RENTAL] Fetched ${rented.length} rented/owned fleets for profile ${profileId}`);
      return rented;
    } catch (e: any) {
      lastErr = e;
      const errMsg = String(e?.message || e || '');
      const { errorType, retryable, knownBad } = getRpcRetryInfo(e);
      const rpcName = pick?.endpoint?.name ?? 'unknown';
      const rpcUrl = pick?.endpoint?.url ?? 'n/a';
      console.log('[DEBUG RENTAL] Error fetching rented fleets for profile', {
        profileId,
        attempt,
        rpcName,
        rpcUrl,
        retryable,
        knownBad,
        errorType,
        error: errMsg
      });
      if (pick && pick.release) {
        try { pick.release({ success: false, errorType }); } catch { }
      }
      if (attempt < maxAttempts) {
        const delayMs = !retryable ? 150 : knownBad ? 75 : Math.min(500 * Math.pow(2, attempt - 1), 4000);
        await sleep(delayMs);
        continue;
      }
      break;
    }
  }

  const fallbackCached = await loadRentedFleetsFromCache(profileId);
  if (fallbackCached.length > 0) {
    console.log(`[DEBUG RENTAL] RPC fetch failed, serving ${fallbackCached.length} rented fleets from cache for profile ${profileId}`);
    return fallbackCached;
  }

  if (lastErr) {
    console.log('[DEBUG RENTAL] No rented fleets cache available after RPC failure', {
      profileId,
      error: String(lastErr?.message || lastErr)
    });
  }
  return [];
}

export default fetchProfileRentedFleets;
