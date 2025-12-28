import { PublicKey } from "@solana/web3.js";
import { byteArrayToString } from "@staratlas/data-source";
import { FleetProcessorInput, FleetProcessorOutput } from './interfaces.js';

export async function processFleets(input: FleetProcessorInput): Promise<FleetProcessorOutput> {
  const {
    fleets,
    playerProfilePubkey,
    walletAuthority,
    walletHeuristicKeys,
    srslyHeuristicKeys,
    operatedByWalletKeys,
    connection
  } = input;

  // Pre-extract owner/subProfile from all fleet accounts for optimization
  const ownerByKey = new Map<string, string | null>();
  const subByKey = new Map<string, string | null>();
  try {
    const allKeys = fleets
      .filter((f: any) => f.type === 'ok')
      .map((f: any) => f.key);
    if (allKeys.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < allKeys.length; i += chunkSize) {
        const chunk = allKeys.slice(i, i + chunkSize);
        const infos = await connection.getMultipleAccountsInfo(chunk);
        for (let j = 0; j < chunk.length; j++) {
          const info = infos[j];
          const k = chunk[j].toBase58();
          if (info?.data && info.data.length >= 105) {
            try {
              const ownerPk = new PublicKey(info.data.slice(41, 73)).toBase58();
              const subPk = new PublicKey(info.data.slice(73, 105)).toBase58();
              ownerByKey.set(k, ownerPk);
              subByKey.set(k, subPk);
            } catch {
              ownerByKey.set(k, null);
              subByKey.set(k, null);
            }
          } else {
            ownerByKey.set(k, null);
            subByKey.set(k, null);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to pre-extract owner/subProfile from accounts:', e);
  }

  const fleetsData = fleets
    .filter((f: any) => f.type === 'ok')
    .map((fleet: any) => {
      const subProfile = fleet.data.data.subProfile;
      const owningProfile = fleet.data.data.owningProfile;
      const keyStr = fleet.key.toString();

      // Resolve base58 strings using raw account bytes first, then fallbacks
      const ownerStr = ownerByKey.get(keyStr) ?? (typeof (owningProfile as any)?.toBase58 === 'function'
        ? (owningProfile as any).toBase58()
        : (typeof (owningProfile as any)?.toString === 'function'
          ? (owningProfile as any).toString()
          : null));
      const subStr = subByKey.get(keyStr) ?? (typeof (subProfile as any)?.toBase58 === 'function'
        ? (subProfile as any).toBase58()
        : (typeof (subProfile as any)?.toString === 'function'
          ? (subProfile as any).toString()
          : null));

      // A fleet is RENTED when any of the following is true:
      // 1) You are the subProfile (you use it) AND you are NOT the owner
      // 2) It was discovered via wallet heuristic AND it's not owned by you
      // 3) It was discovered via SRSLY rental scan AND it's not owned by you
      const rentedBySubProfile = !!(
        subStr &&
        subStr === playerProfilePubkey.toBase58() &&
        ownerStr &&
        ownerStr !== playerProfilePubkey.toBase58()
      );
      const rentedByWalletHeuristic = !!(
        (walletHeuristicKeys.has(keyStr) || operatedByWalletKeys.has(keyStr)) &&
        // treat unknown owner as not owned by player
        (ownerStr ? (ownerStr !== playerProfilePubkey.toBase58()) : true)
      );
      const rentedBySrsly = !!(
        srslyHeuristicKeys.has(keyStr) &&
        (ownerStr ? (ownerStr !== playerProfilePubkey.toBase58()) : true)
      );
      const isRented = rentedBySubProfile || rentedByWalletHeuristic || rentedBySrsly;

      try {
        const name = byteArrayToString(fleet.data.data.fleetLabel) || '<unnamed>';
        //console.log(
        //  `[fleets] ${name} | key=${keyStr} | owner=${ownerStr} | sub=${subStr} | flags: subMatch=${subStr===playerProfilePubkey.toString()} ownerMatch=${ownerStr===playerProfilePubkey.toString()} walletHeuristic=${walletHeuristicKeys.has(keyStr)} srslyHeuristic=${srslyHeuristicKeys.has(keyStr)} => isRented=${isRented}`
        //);
      } catch {}

      return {
        callsign: byteArrayToString(fleet.data.data.fleetLabel),
        key: fleet.key.toString(),
        data: fleet.data.data,
        isRented: isRented
      };
    });

  return {
    fleetsData
  };
}