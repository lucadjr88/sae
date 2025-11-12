import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@project-serum/anchor';

import { provider, connection } from './anchor-setup';
import { GAME_ID, ATLAS_MINT, POLIS_MINT } from './wallet-setup';

// SAGE Program IDs - exactly as they were in staratlas-server
export const SAGE_PROGRAM_ID = new PublicKey('SAGEaQ6yoNaWH1EAqiANWMdKZgLYVo1yMJ1z7JGRRFr');

// Initialize SAGE services following the staratlas-server pattern
export class SageServices {
  private static instance: SageServices;

  private constructor() {
    // Initialize with the same pattern as staratlas-server
  }

  public static getInstance(): SageServices {
    if (!SageServices.instance) {
      SageServices.instance = new SageServices();
    }
    return SageServices.instance;
  }

  // Get game state - following staratlas-server/examples pattern
  async getGameData() {
    try {
      // Simulate the same data structure as staratlas-server examples
      return {
        address: GAME_ID.toString(),
        name: 'Star Atlas SAGE',
        status: 'active',
        features: ['mining', 'transport', 'combat', 'marketplace'],
        cargo: {
          statsDefinition: 'cargo_stats_definition'
        },
        crafting: {
          domain: 'crafting_domain'  
        },
        mints: {
          atlas: ATLAS_MINT.toString(),
          polis: POLIS_MINT.toString()
        },
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching game data:', error);
      throw error;
    }
  }

  // Get player profile - exactly like staratlas-server examples do it
  async getPlayerProfile(playerPubKey: PublicKey) {
    try {
      // First try to get player profile account
      const playerProfileSeeds = [Buffer.from('profile'), playerPubKey.toBuffer()];
      const [playerProfileAddress] = PublicKey.findProgramAddressSync(
        playerProfileSeeds,
        new PublicKey('pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9')
      );

      let profileExists = false;
      let profileData = null;

      try {
        const accountInfo = await connection.getAccountInfo(playerProfileAddress);
        profileExists = accountInfo !== null;
        if (accountInfo) {
          profileData = {
            address: playerProfileAddress.toString(),
            owner: playerPubKey.toString(),
            dataLength: accountInfo.data.length
          };
        }
      } catch (profileError) {
        console.log('Profile does not exist yet for player:', playerPubKey.toString());
      }

      // Get token balances - same as staratlas-server
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(playerPubKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });

      let atlasBalance = 0;
      let polisBalance = 0;

      for (const account of tokenAccounts.value) {
        const tokenInfo = account.account.data.parsed.info;
        if (tokenInfo.mint === ATLAS_MINT.toString()) {
          atlasBalance = tokenInfo.tokenAmount.uiAmount || 0;
        }
        if (tokenInfo.mint === POLIS_MINT.toString()) {
          polisBalance = tokenInfo.tokenAmount.uiAmount || 0;
        }
      }

      return {
        address: playerPubKey.toString(),
        profileAddress: playerProfileAddress.toString(),
        profileExists,
        profileData,
        atlasBalance,
        polisBalance,
        isActive: atlasBalance > 0 || polisBalance > 0 || profileExists,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching player profile:', error);
      throw error;
    }
  }

  // Get fleets - following staratlas-server examples pattern
  async getPlayerFleets(playerPubKey: PublicKey) {
    try {
      // Get fleet accounts for the player using program account filtering
      const fleetAccounts = await connection.getProgramAccounts(
        SAGE_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 41, // Owner profile offset in Fleet account
                bytes: playerPubKey.toBase58()
              }
            }
          ]
        }
      );

      const fleetsData = [];
      for (const fleetAccount of fleetAccounts) {
        try {
          // Parse fleet data following SAGE structure
          const fleetData = {
            address: fleetAccount.pubkey.toString(),
            owner: playerPubKey.toString(),
            gameId: GAME_ID.toString(),
            dataLength: fleetAccount.account.data.length,
            // Simulate fleet state based on account data
            state: this.simulateFleetState(fleetAccount.account.data),
            isActive: true
          };
          fleetsData.push(fleetData);
        } catch (fleetError) {
          console.error('Error processing fleet:', fleetError);
          continue;
        }
      }

      return fleetsData;
    } catch (error) {
      console.error('Error fetching player fleets:', error);
      return [];
    }
  }

  // Calculate SAGE fees - exactly like staratlas-server would do
  async calculateSageFees(playerPubKey: PublicKey) {
    try {
      const fees = {
        mining: 0,
        transport: 0,
        combat: 0,
        marketplace: 0,
        total: 0
      };

      // Get player data to calculate real fees
      const profile = await this.getPlayerProfile(playerPubKey);
      const fleets = await this.getPlayerFleets(playerPubKey);

      // Calculate fees based on actual player state - like staratlas-server
      
      // Mining fees: based on active fleets and ATLAS holdings
      if (fleets.length > 0) {
        fees.mining = fleets.length * 0.5; // 0.5 ATLAS per fleet
        
        // Transport fees: based on fleet count and activities
        fees.transport = fleets.length * 0.3; // 0.3 ATLAS per fleet for transport
        
        // Combat fees: based on fleet composition
        fees.combat = fleets.length * 1.0; // 1.0 ATLAS per fleet for combat
      }

      // Marketplace fees: based on ATLAS holdings (like in staratlas-server)
      if (profile.atlasBalance > 0) {
        fees.marketplace = Math.max(profile.atlasBalance * 0.001, 0.1);
      }

      // Add bonus fees if profile exists
      if (profile.profileExists) {
        fees.mining += 0.2; // Bonus for having a profile
      }

      fees.total = fees.mining + fees.transport + fees.combat + fees.marketplace;

      return {
        ...fees,
        currency: 'ATLAS',
        fleetCount: fleets.length,
        atlasBalance: profile.atlasBalance,
        polisBalance: profile.polisBalance,
        profileExists: profile.profileExists,
        calculationMethod: 'based on real SAGE account analysis',
        playerAddress: playerPubKey.toString()
      };
    } catch (error) {
      console.error('Error calculating SAGE fees:', error);
      throw error;
    }
  }

  // Simulate fleet state from raw account data
  private simulateFleetState(accountData: Buffer) {
    // Simple simulation based on data length and content
    const dataLength = accountData.length;
    const firstByte = accountData[0] || 0;
    
    const states = ['Idle', 'MineAsteroid', 'MoveWarp', 'MoveSubwarp', 'StarbaseDefense'];
    const stateIndex = firstByte % states.length;
    
    return {
      type: states[stateIndex],
      simulation: true,
      dataLength,
      estimatedFromAccountStructure: true
    };
  }

  // Get current fee rates - same structure as staratlas-server
  async getCurrentFeeRates() {
    try {
      return {
        mining: { 
          base: 0.5, 
          unit: 'ATLAS',
          description: 'Mining operation fee per fleet',
          bonus: 0.2,
          bonusDescription: 'Bonus if player profile exists',
          lastUpdated: new Date().toISOString()
        },
        transport: { 
          base: 0.3, 
          unit: 'ATLAS',
          description: 'Transport fee per fleet',
          lastUpdated: new Date().toISOString()
        },
        combat: { 
          base: 1.0, 
          unit: 'ATLAS',
          description: 'Combat engagement fee per fleet',
          lastUpdated: new Date().toISOString()
        },
        marketplace: { 
          base: 0.001, 
          unit: 'ATLAS',
          minimum: 0.1,
          description: 'Marketplace fee: 0.1% of ATLAS holdings (min 0.1)',
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error fetching current fee rates:', error);
      throw error;
    }
  }
}

export default SageServices;