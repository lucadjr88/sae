import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { readAllFromRPC, readFromRPC } from "@staratlas/data-source";
import { PLAYER_PROFILE_IDL, PlayerProfile } from "@staratlas/player-profile";
import { newConnection, newAnchorProvider } from '../utils/anchor-setup.js';
import { loadKeypair } from '../utils/wallet-setup.js';

const PLAYER_PROFILE_PROGRAM_ID = "pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9";

export async function getPlayerProfile(rpcEndpoint: string, rpcWebsocket: string, walletPath: string, profileId: string) {
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const wallet = loadKeypair(walletPath);
  const provider = newAnchorProvider(connection, wallet);

  try {
    console.log('Using profile ID directly:', profileId);
    
    // Return mock profile with the correct structure for our use case
    // We'll get the wallet authority from the fleets API instead
    return [{
      _key: profileId,
      authority: null, // Will be populated by examining fleet ownership
      // Add other required fields as needed
    }];
    
  } catch (error) {
    console.error('Error with profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`No player profile found: ${errorMessage}`);
  }
}
