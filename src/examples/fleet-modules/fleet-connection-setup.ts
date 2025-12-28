import { newConnection, newAnchorProvider } from '../../utils/anchor-setup.js';
import { loadKeypair } from '../../utils/wallet-setup.js';
import { SAGE_PROGRAM_ID } from '../fleets-constants.js';
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { SAGE_IDL } from "@staratlas/sage";
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import { FleetConnectionSetupInput, FleetConnectionSetupOutput, FleetContext } from './interfaces.js';

/**
 * Modulo per setup connessioni, provider e programma SAGE.
 * Responsabilità: Inizializzare tutte le dipendenze di connessione necessarie.
 */
export async function setupFleetConnections(input: FleetConnectionSetupInput): Promise<FleetConnectionSetupOutput> {
  const { anchorConnOrEndpoint, poolConnOrWebsocket, walletPath, profileId } = input;

  console.log(`[FleetConnectionSetup] start ${profileId}`);
  const startTime = Date.now();

  // Resolve Anchor connection
  let anchorConnection: any;
  if (typeof anchorConnOrEndpoint === 'string') {
    const endpoint = anchorConnOrEndpoint;
    console.log(`[FleetConnectionSetup] conn -> ${endpoint}`);
    const connStart = Date.now();
    anchorConnection = newConnection(endpoint, undefined); // ws non specificato qui
    console.log(`[FleetConnectionSetup] conn ok ${Date.now() - connStart}ms`);
  } else {
    anchorConnection = anchorConnOrEndpoint;
  }

  // Resolve pool connection
  let poolConnection: any;
  if (poolConnOrWebsocket && typeof (poolConnOrWebsocket as any).getProgramAccounts === 'function') {
    poolConnection = poolConnOrWebsocket;
    console.log('[FleetConnectionSetup] using provided RpcPoolConnection');
  } else {
    // Fallback: usa anchorConnection
    poolConnection = anchorConnection;
    console.log('[FleetConnectionSetup] using anchorConnection for reads');
  }

  // Load wallet
  console.log(`[FleetConnectionSetup] wallet -> ${walletPath}`);
  const walletStart = Date.now();
  const wallet = loadKeypair(walletPath);
  console.log(`[FleetConnectionSetup] wallet ok ${Date.now() - walletStart}ms`);

  // Create provider
  console.log(`[FleetConnectionSetup] provider ->`);
  const providerStart = Date.now();
  const provider = newAnchorProvider(anchorConnection, wallet);
  console.log(`[FleetConnectionSetup] provider ok ${Date.now() - providerStart}ms`);

  // Initialize SAGE program
  console.log(`[FleetConnectionSetup] program ->`);
  const programStart = Date.now();
  const sageProgram = new Program(SAGE_IDL, SAGE_PROGRAM_ID, provider);
  const playerProfilePubkey = new PublicKey(profileId);
  console.log(`[FleetConnectionSetup] program ok ${Date.now() - programStart}ms`);

  // Initialize context
  const context: FleetContext = {
    fleets: [],
    knownFleetKeys: new Set(),
    walletAuthority: null,
    feePayerScannedDuringDerivation: false,
    primaryPayerCounts: [],
    fallbackPayerCounts: [],
    walletHeuristicKeys: new Set(),
    srslyHeuristicKeys: new Set(),
    operatedByWalletKeys: new Set(),
    anchorConnection,
    poolConnection,
  };

  console.log(`[FleetConnectionSetup] setup ${Date.now() - startTime}ms`);

  return {
    provider,
    sageProgram,
    wallet,
    playerProfilePubkey,
    context,
  };
}