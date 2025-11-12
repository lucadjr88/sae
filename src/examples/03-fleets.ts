import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { byteArrayToString, readAllFromRPC } from "@staratlas/data-source";
import { Fleet, SAGE_IDL } from "@staratlas/sage";
import { newConnection, newAnchorProvider } from '../utils/anchor-setup.js';
import { loadKeypair } from '../utils/wallet-setup.js';

const SAGE_PROGRAM_ID = "SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE";

export async function getFleets(rpcEndpoint: string, rpcWebsocket: string, walletPath: string, profileId: string) {
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const wallet = loadKeypair(walletPath);
  const provider = newAnchorProvider(connection, wallet);

  const sageProgram = new Program(SAGE_IDL, SAGE_PROGRAM_ID, provider);
  const playerProfilePubkey = new PublicKey(profileId);

  const fleets = await readAllFromRPC(
    connection,
    sageProgram as any,
    Fleet,
    'processed',
    [{
      memcmp: {
        offset: 8 + 1 + 32,
        bytes: playerProfilePubkey.toBase58(),
      },
    }],
  );

  if (fleets.length === 0) {
    throw new Error('No fleets found');
  }

  return fleets
    .filter((f: any) => f.type === 'ok')
    .map((fleet: any) => ({
      callsign: byteArrayToString(fleet.data.data.fleetLabel),
      data: fleet.data.data
    }));
}
