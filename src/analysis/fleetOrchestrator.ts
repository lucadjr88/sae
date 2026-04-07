
import { aggregateFleetStats } from './aggregateFleetStats.js';
import { fetchAllProfileWalletTxs } from './fetchAllProfileWalletTxs.js';
import { fetchProfileFleets } from '../utils/fetchProfileFleets.js';
import fetchProfileRentedFleets from '../utils/fetchProfileRentedFleets.js';
import { deriveWalletAuthority } from '../utils/deriveWalletAuthority.js';
import { decodeAllFleetInstructions } from './decodeFleetInstructions.js';
import { associateOpsToFleets } from './associateOpsToFleets.js';
import { saveBreakdownAndPlayerOps } from './saveBreakdownAndPlayerOps.js';
import { saveFleetsAndRented } from './saveFleetsAndRented.js';
import { saveUnknownOps } from './saveUnknownOps.js';

export async function orchestrateFleetsForProfile(profileId: string, cutoffMs?: number) {
  const fleets = await fetchProfileFleets(profileId);
  const rentedFleets = await fetchProfileRentedFleets(profileId);
  const walletAuthority = await deriveWalletAuthority(fleets, profileId);
  // TODO: derive feePayer reale, qui mock = walletAuthority
  const feePayer = walletAuthority;
  const sinceMs = typeof cutoffMs === 'number' ? cutoffMs : 0;
  const walletTxs = await fetchAllProfileWalletTxs(profileId, walletAuthority, feePayer, sinceMs);
  const fleetsWithDecoded = await decodeAllFleetInstructions(fleets);
  // Flat array di tutte le ops decodificate
  const allOps = fleetsWithDecoded.flatMap(f => f.decodedInstructions || []);
  const { fleetBreakdown, playerOps } = associateOpsToFleets(allOps, fleets);
  await saveFleetsAndRented(profileId, fleets, rentedFleets);
  await saveBreakdownAndPlayerOps(profileId, fleetBreakdown, playerOps);
  // Salva unknown ops (quelle senza instructionName o con error)
  const unknownOps = allOps.filter(op => !op.instructionName || op.instructionName === 'Unknown' || op.error);
  await saveUnknownOps(profileId, unknownOps);
  const aggregation = aggregateFleetStats(fleetsWithDecoded);
  return {
    fleets: fleetsWithDecoded,
    rentedFleets,
    walletAuthority,
    feePayer,
    walletTxs,
    aggregation,
    fleetBreakdown,
    playerOps
  };
}
