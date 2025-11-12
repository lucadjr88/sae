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

  const fleetsData = fleets
    .filter((f: any) => f.type === 'ok')
    .map((fleet: any) => ({
      callsign: byteArrayToString(fleet.data.data.fleetLabel),
      key: fleet.key.toString(),
      data: fleet.data.data
    }));
  
  // Derive wallet from first fleet's transaction signer
  let walletAuthority: string | null = null;
  
  if (fleetsData.length > 0) {
    try {
      const firstFleetKey = fleetsData[0].key;
      console.log('Fetching transaction for fleet to derive wallet:', firstFleetKey);
      
      // Get the most recent transaction for this fleet
      const signatures = await connection.getSignaturesForAddress(
        new PublicKey(firstFleetKey),
        { limit: 1 }
      );
      
      if (signatures.length > 0) {
        const tx = await connection.getParsedTransaction(
          signatures[0].signature,
          { maxSupportedTransactionVersion: 0 }
        );
        
        if (tx && tx.transaction.message.accountKeys.length > 0) {
          // The first account is typically the fee payer/signer (the wallet)
          walletAuthority = tx.transaction.message.accountKeys[0].pubkey.toString();
          console.log('Derived wallet authority from transaction:', walletAuthority);
        }
      }
    } catch (error) {
      console.error('Error deriving wallet from fleet transaction:', error);
    }
  }

  return {
    fleets: fleetsData,
    walletAuthority: walletAuthority
  };
}
