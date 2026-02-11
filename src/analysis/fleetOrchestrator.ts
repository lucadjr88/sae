
import { aggregateFleetStats } from './aggregateFleetStats';
import { fetchAllProfileWalletTxs } from './fetchAllProfileWalletTxs';
import { fetchProfileFleets } from '../utils/fetchProfileFleets';
import fetchProfileRentedFleets from '../utils/fetchProfileRentedFleets';
import { deriveWalletAuthority } from '../utils/deriveWalletAuthority';
import { decodeAllFleetInstructions } from './decodeFleetInstructions';
import { associateOpsToFleets } from './associateOpsToFleets';
import { saveBreakdownAndPlayerOps } from './saveBreakdownAndPlayerOps';
import { saveFleetsAndRented } from './saveFleetsAndRented';
import { saveUnknownOps } from './saveUnknownOps';

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
