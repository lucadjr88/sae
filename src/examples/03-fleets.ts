import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { byteArrayToString, readAllFromRPC } from "@staratlas/data-source";
import { Fleet, SAGE_IDL } from "@staratlas/sage";
import { newConnection, newAnchorProvider } from '../utils/anchor-setup.js';
import { loadKeypair } from '../utils/wallet-setup.js';

const SAGE_PROGRAM_ID = "SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE";
const SRSLY_PROGRAM_ID = "SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT";

export async function getFleets(rpcEndpoint: string, rpcWebsocket: string, walletPath: string, profileId: string) {
  const connection = newConnection(rpcEndpoint, rpcWebsocket);
  const wallet = loadKeypair(walletPath);
  const provider = newAnchorProvider(connection, wallet);

  const sageProgram = new Program(SAGE_IDL, SAGE_PROGRAM_ID, provider);
  const playerProfilePubkey = new PublicKey(profileId);

  // Get fleets owned by the player (owningProfile matches)
  const ownedFleets = await readAllFromRPC(
    connection,
    sageProgram as any,
    Fleet,
    'processed',
    [{
      memcmp: {
        offset: 41, // 8 (discriminator) + 1 (version) + 32 (gameId) = 41
        bytes: playerProfilePubkey.toBase58(),
      },
    }],
  );

  // Get fleets rented by the player (subProfile matches)
  // subProfile is at offset: 8 (discriminator) + 1 (version) + 32 (gameId) + 32 (owningProfile) = 73
  const rentedFleets = await readAllFromRPC(
    connection,
    sageProgram as any,
    Fleet,
    'processed',
    [{
      memcmp: {
        offset: 73, // subProfile offset
        bytes: playerProfilePubkey.toBase58(),
      },
    }],
  );

  // Combine both owned and rented fleets
  const fleets = [...ownedFleets, ...rentedFleets];
  const knownFleetKeys = new Set<string>(fleets.filter((f: any) => f && (f as any).key)
    .map((f: any) => (f as any).key.toString()));
  
  // NEW: Also find fleets that have recent transactions signed by the wallet
  // This catches borrowed/rented fleets that don't have player profile in subProfile
  let walletAuthority: string | null = null;
  const additionalFleetKeys = new Set<string>();
  
  // First, derive wallet by scanning recent tx across fleets and counting fee payers
  if (fleets.length > 0) {
    try {
      const payerCounts = new Map<string, number>();
      const sampleFleets = fleets.slice(0, Math.min(10, fleets.length));
      for (const f of sampleFleets) {
        const fleetKey = (f as any).key.toString();
        const signatures = await connection.getSignaturesForAddress(new PublicKey(fleetKey), { limit: 3 });
        for (const sig of signatures) {
          try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            const feePayer = tx?.transaction.message.accountKeys?.[0]?.pubkey?.toString();
            if (feePayer) payerCounts.set(feePayer, (payerCounts.get(feePayer) || 0) + 1);
          } catch {}
        }
      }
      // Pick the most frequent payer
      let topPayer: string | null = null;
      let topCount = 0;
      for (const [payer, count] of payerCounts.entries()) {
        if (count > topCount) { topCount = count; topPayer = payer; }
      }
      if (topPayer) {
        walletAuthority = topPayer;
        console.log('Derived wallet authority (tallied):', walletAuthority, 'from', topCount, 'occurrences');
      }
    } catch (error) {
      console.error('Error deriving wallet:', error);
    }
  }
  
  // Now search for fleet accounts that have recent transactions from this wallet
  if (walletAuthority) {
    try {
      console.log('Searching for rented fleets via wallet transactions...');
      const walletSignatures = await connection.getSignaturesForAddress(
        new PublicKey(walletAuthority),
        { limit: 100 } // Last 100 transactions should be enough
      );
      
      console.log(`Found ${walletSignatures.length} recent wallet transactions`);
      
      // Check each transaction for fleet accounts
      for (const sig of walletSignatures.slice(0, 50)) { // Check last 50 to avoid rate limits
        try {
          const tx = await connection.getParsedTransaction(
            sig.signature,
            { maxSupportedTransactionVersion: 0 }
          );
          
          if (!tx) continue;
          
          // Look for SAGE program involvement
          const hasSage = tx.transaction.message.accountKeys.some(
            key => key.pubkey.toString() === SAGE_PROGRAM_ID
          );
          
          if (!hasSage) continue;
          
          // Extract all fleet-like accounts (accounts that might be fleets)
          for (const accountKey of tx.transaction.message.accountKeys) {
            const account = accountKey.pubkey.toString();
            
            // Skip if already known
            if (fleets.some((f: any) => f.key.toString() === account)) continue;
            if (additionalFleetKeys.has(account)) continue;
            
            // Try to read as Fleet
            try {
              const accountInfo = await connection.getAccountInfo(new PublicKey(account));
              if (!accountInfo || accountInfo.data.length !== 536) continue; // Fleet accounts are 536 bytes
              
              // Check if this is owned by SAGE program
              if (accountInfo.owner.toString() !== SAGE_PROGRAM_ID) continue;
              
              additionalFleetKeys.add(account);
            } catch {
              // Not a valid fleet account
            }
          }
        } catch (error) {
          // Skip failed transactions
        }
      }
      
      console.log(`Found ${additionalFleetKeys.size} potential rented fleet accounts`);
      
      // Fetch full fleet data for additional fleets
      for (const fleetKey of additionalFleetKeys) {
        try {
          // Fetch by direct pubkey via Anchor account fetch
          const fleetPubkey = new PublicKey(fleetKey);
          // @ts-ignore - account type name from IDL
          const accountData = await (sageProgram.account as any).fleet.fetch(fleetPubkey);
          if (accountData) {
            const wrapped = {
              type: 'ok',
              key: fleetPubkey,
              data: { data: accountData },
            } as any;
            fleets.push(wrapped);
            knownFleetKeys.add(fleetKey);
            console.log(`Added rented fleet (wallet heuristic): ${byteArrayToString((accountData as any).fleetLabel)}`);
          }
        } catch (error) {
          console.error(`Error fetching fleet ${fleetKey}:`, error);
        }
      }
    } catch (error) {
      console.error('Error searching for rented fleets:', error);
    }
  }

  // NEW: SRSLY rentals scan - identify fleets referenced by the rentals program for this profile
  try {
    console.log('Scanning SRSLY rentals to augment rented fleets...');
    const srslyProgramKey = new PublicKey(SRSLY_PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(srslyProgramKey);

    // Helper to find byte subsequence
    const bufIncludes = (haystack: Uint8Array, needle: Uint8Array) => {
      outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
          if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
      }
      return -1;
    };

    const borrowerBytes = playerProfilePubkey.toBytes();
    const srslyWithBorrower = accounts.filter(a => a.account.data && bufIncludes(a.account.data, borrowerBytes) !== -1);
    console.log(`SRSLY accounts referencing borrower: ${srslyWithBorrower.length}`);

    // From those accounts, collect all 32-byte windows and probe for SAGE fleet accounts
    const candidateKeys = new Set<string>();
    for (const { account } of srslyWithBorrower) {
      const data = account.data;
      if (!data || data.length < 32) continue;
      for (let i = 0; i <= data.length - 32; i++) {
        const slice = data.subarray(i, i + 32);
        try {
          const pk = new PublicKey(slice);
          candidateKeys.add(pk.toBase58());
        } catch { /* ignore */ }
      }
    }

    // Batch-check candidates in chunks
    const candidates = Array.from(candidateKeys);
    const chunkSize = 50;
    const discoveredFleetKeys: string[] = [];
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize).map(k => new PublicKey(k));
      const infos = await connection.getMultipleAccountsInfo(chunk);
      for (let j = 0; j < chunk.length; j++) {
        const info = infos[j];
        if (!info) continue;
        if (info.owner.toBase58() === SAGE_PROGRAM_ID && info.data.length === 536) {
          const k = chunk[j].toBase58();
          if (!knownFleetKeys.has(k)) {
            discoveredFleetKeys.push(k);
          }
        }
      }
    }

    // Fetch and append these fleets as rented
    for (const k of discoveredFleetKeys) {
      try {
        const fleetPubkey = new PublicKey(k);
        // @ts-ignore - account type name from IDL
        const accountData = await (sageProgram.account as any).fleet.fetch(fleetPubkey);
        if (accountData) {
          const wrapped = {
            type: 'ok',
            key: fleetPubkey,
            data: { data: accountData },
          } as any;
          fleets.push(wrapped);
          knownFleetKeys.add(k);
          console.log(`Added rented fleet (SRSLY): ${byteArrayToString((accountData as any).fleetLabel)}`);
        }
      } catch (e) {
        console.error(`Failed to fetch SRSLY-discovered fleet ${k}:`, e);
      }
    }
  } catch (e) {
    console.error('SRSLY scan failed (non-fatal):', e);
  }

  if (fleets.length === 0) {
    throw new Error('No fleets found');
  }

  const fleetsData = fleets
    .filter((f: any) => f.type === 'ok')
    .map((fleet: any) => {
      const isRented = fleet.data.data.subProfile && 
                       fleet.data.data.subProfile.toString() === playerProfilePubkey.toString();
      return {
        callsign: byteArrayToString(fleet.data.data.fleetLabel),
        key: fleet.key.toString(),
        data: fleet.data.data,
        // If subProfile matches, or if not owned by this profile but discovered via SRSLY/wallet heuristics, mark rented
        isRented: isRented || (fleet.data.data.owningProfile && fleet.data.data.owningProfile.toString() !== playerProfilePubkey.toString())
      };
    });
  
  return {
    fleets: fleetsData,
    walletAuthority: walletAuthority
  };
}
