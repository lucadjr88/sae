import { Connection } from "@solana/web3.js";
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { newConnection, newAnchorProvider } from '../utils/anchor-setup.js';
import { loadKeypair } from '../utils/wallet-setup.js';
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { SAGE_IDL } from "@staratlas/sage";
import { SAGE_PROGRAM_ID } from './fleets-constants.js';
import { setupFleetConnections } from './fleet-modules/fleet-connection-setup.js';
import { fetchFleets } from './fleet-modules/fleet-fetcher.js';
import { deriveWalletAuthority } from './fleet-modules/wallet-authority-deriver.js';
import { scanWalletTransactions } from './fleet-modules/wallet-transaction-scanner.js';
import { scanSrslyRentals } from './fleet-modules/srsly-rental-scanner.js';
import { processFleets } from './fleet-modules/fleet-processor.js';

export async function getFleets(
  anchorConnOrEndpoint: Connection | string,
  poolConnOrWebsocket: RpcPoolConnection | Connection | string,
  walletPath: string,
  profileId: string
) {
  console.log(`[fleets] start ${profileId} (MODULAR VERSION)`);
  const startTime = Date.now();

  // Step 1: Setup connections and provider using FleetConnectionSetup
  const setupResult = await setupFleetConnections({
    anchorConnOrEndpoint,
    poolConnOrWebsocket,
    walletPath,
    profileId
  });

  const {
    provider,
    sageProgram,
    wallet,
    playerProfilePubkey,
    context
  } = setupResult;

  console.log(`[fleets] setup ${Date.now() - startTime}ms`);

  // Step 2: Fetch owned and rented fleets
  console.log(`[fleets] fetch owned+rented ...`);
  const fetchStart = Date.now();

  const fetchResult = await fetchFleets({
    sageProgram,
    playerProfilePubkey,
    connection: context.poolConnection
  });

  const { ownedFleets, rentedFleets } = fetchResult;
  const fleets = [...ownedFleets, ...rentedFleets];

  // Update context with initial fleets
  context.fleets = fleets;
  fleets.forEach((f: any) => context.knownFleetKeys.add(f.key.toString()));

  console.log(`[fleets] fetch owned+rented ok ${Date.now() - fetchStart}ms (${ownedFleets.length} owned, ${rentedFleets.length} rented)`);

  // Step 3: Derive wallet authority from fee payers
  console.log(`[fleets] derive wallet authority...`);
  const deriveStart = Date.now();

  const deriveResult = await deriveWalletAuthority({
    fleets: context.fleets,
    connection: context.poolConnection,
    playerProfilePubkey
  });

  context.walletAuthority = deriveResult.walletAuthority;
  context.feePayerScannedDuringDerivation = deriveResult.feePayerScannedDuringDerivation;

  console.log(`[fleets] derive wallet authority ok ${Date.now() - deriveStart}ms (authority: ${context.walletAuthority ? context.walletAuthority.substring(0, 8) + '...' : 'none'})`);

  // Step 4: Scan wallet transactions for additional fleets (if wallet authority found)
  console.log(`[fleets] scan wallet transactions...`);
  const walletScanStart = Date.now();

  const walletScanResult = await scanWalletTransactions({
    walletAuthority: context.walletAuthority,
    connection: context.poolConnection,
    knownFleetKeys: context.knownFleetKeys,
    sageProgram
  });

  // Add additional fleets to context
  context.fleets.push(...walletScanResult.additionalFleets);
  walletScanResult.additionalFleets.forEach((f: any) => context.knownFleetKeys.add(f.key.toString()));
  walletScanResult.walletHeuristicKeys.forEach(key => context.walletHeuristicKeys.add(key));
  walletScanResult.operatedByWalletKeys.forEach(key => context.operatedByWalletKeys.add(key));

  console.log(`[fleets] scan wallet transactions ok ${Date.now() - walletScanStart}ms (+${walletScanResult.additionalFleets.length} fleets)`);

  // Step 5: Scan SRSLY rentals for additional fleets
  console.log(`[fleets] scan SRSLY rentals...`);
  const srslyScanStart = Date.now();

  const srslyScanResult = await scanSrslyRentals({
    playerProfilePubkey,
    connection: context.poolConnection,
    knownFleetKeys: context.knownFleetKeys,
    sageProgram
  });

  // Add SRSLY fleets to context
  context.fleets.push(...srslyScanResult.srslyFleets);
  srslyScanResult.srslyFleets.forEach((f: any) => context.knownFleetKeys.add(f.key.toString()));
  srslyScanResult.srslyHeuristicKeys.forEach(key => context.srslyHeuristicKeys.add(key));

  console.log(`[fleets] scan SRSLY rentals ok ${Date.now() - srslyScanStart}ms (+${srslyScanResult.srslyFleets.length} fleets)`);

  // Step 6: Process final fleet data
  console.log(`[fleets] process fleet data...`);
  const processStart = Date.now();

  const processResult = await processFleets({
    fleets: context.fleets,
    playerProfilePubkey,
    walletAuthority: context.walletAuthority,
    walletHeuristicKeys: context.walletHeuristicKeys,
    srslyHeuristicKeys: context.srslyHeuristicKeys,
    operatedByWalletKeys: context.operatedByWalletKeys,
    connection: context.poolConnection
  });

  console.log(`[fleets] process fleet data ok ${Date.now() - processStart}ms`);

  // Return final result in original format
  const result = {
    fleets: processResult.fleetsData,
    walletAuthority: context.walletAuthority,
    _feePayerScannedDuringDerivation: context.feePayerScannedDuringDerivation
  };

  console.log(`[fleets] total ${Date.now() - startTime}ms (${result.fleets.length} fleets)`);
  return result;
}