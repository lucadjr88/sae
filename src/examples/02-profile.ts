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

  const program = new Program(PLAYER_PROFILE_IDL as any, PLAYER_PROFILE_PROGRAM_ID, provider);
  const profilePubkey = new PublicKey(profileId);

  try {
    console.log('Fetching player profile:', profileId);
    
    // Read the player profile account data directly
    const profileAccount = await program.account.playerProfile.fetch(profilePubkey);
    
    console.log('Profile data:', profileAccount);
    
    // Extract the authority (wallet) from the profile
    const authority = (profileAccount as any).authKeyIndex?.key?.toString() || 
                     (profileAccount as any).authKey?.toString() ||
                     (profileAccount as any).authority?.toString();
    
    if (!authority) {
      throw new Error('Could not find wallet authority in profile');
    }
    
    console.log('Derived wallet authority:', authority);
    
    return {
      profileId: profileId,
      authority: authority,
      profileData: profileAccount
    };
    
  } catch (error) {
    console.error('Error fetching profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch player profile: ${errorMessage}`);
  }
}
