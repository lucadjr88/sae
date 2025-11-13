import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { byteArrayToString, readAllFromRPC } from "@staratlas/data-source";
import { Fleet, SAGE_IDL } from "@staratlas/sage";
import { newConnection, newAnchorProvider, withRetry } from '../utils/anchor-setup.js';
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
  // Track fleets discovered via heuristics to mark them as rented later
  const walletHeuristicKeys = new Set<string>();
  const srslyHeuristicKeys = new Set<string>();
  // Track fleets that show recent usage by the derived wallet (fee payer)
  const operatedByWalletKeys = new Set<string>();
  
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
  
  // OPTIMIZED: Analyze wallet transactions and extract SAGE fleet accounts
  if (walletAuthority) {
    try {
      console.log('Analyzing wallet transactions for SAGE fleet involvement (optimized)...');
      const cutoffMs = Date.now() - (24 * 60 * 60 * 1000); // 24h cutoff
      
      // Collect wallet signatures with early cutoff - process in chunks of 500
      const walletSignatures: any[] = [];
      let before: string | undefined = undefined;
      const maxToAnalyze = 5000; // Allow more for 24h coverage, but process efficiently
      
      console.log('[wallet-scan] Fetching recent wallet signatures (up to 5000 for 24h)...');
      let fetchBatchCount = 0;
      while (walletSignatures.length < maxToAnalyze) {
        fetchBatchCount++;
        const batch = await connection.getSignaturesForAddress(
          new PublicKey(walletAuthority),
          { limit: 200, before } // Original batch size
        );
        
        console.log(`[wallet-scan] Batch ${fetchBatchCount}: fetched ${batch.length} signatures, total: ${walletSignatures.length}`);
        
        if (batch.length === 0) break;
        
        for (const sig of batch) {
          const btMs = sig.blockTime ? sig.blockTime * 1000 : 0;
          // Early cutoff if older than 24h
          if (sig.blockTime && btMs < cutoffMs) {
            console.log(`[wallet-scan] cutoff reached at ${new Date(btMs).toISOString()}`);
            break;
          }
          walletSignatures.push(sig);
          if (walletSignatures.length >= maxToAnalyze) break;
        }
        
        if (walletSignatures.length >= maxToAnalyze) break;
        const last = batch[batch.length - 1];
        before = last.signature;
        if (last.blockTime && (last.blockTime * 1000) < cutoffMs) break;
        
        // Delay every 2000 signatures to avoid rate limiting
        if (walletSignatures.length % 2000 === 0) {
          console.log(`[wallet-scan] Pausing briefly at ${walletSignatures.length} signatures...`);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`[wallet-scan] Collected ${walletSignatures.length} signatures`);
      
      // Now extract fleet accounts from these transactions efficiently
      console.log(`[tx-analysis] Processing ${walletSignatures.length} wallet transactions...`);
      
      let analyzedCount = 0;
      const fleetCandidates = new Set<string>();
      const startTime = Date.now();
      
      for (const sig of walletSignatures) {
        analyzedCount++;
        if (analyzedCount % 50 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (analyzedCount / (Date.now() - startTime) * 1000).toFixed(1);
          console.log(`[tx-analysis] ${analyzedCount}/${walletSignatures.length} txs (${elapsed}s, ${rate} tx/s)`);
        }
        
        // Delay every 10 transactions to avoid rate limiting
        if (analyzedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        try {
          // Use getTransaction (faster than getParsedTransaction)
          const tx = await connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx) {
            if (analyzedCount % 100 === 0) {
              console.log(`[tx-analysis] Warning: tx ${analyzedCount} returned null`);
            }
            continue;
          }
          
          // Check if SAGE program is involved
          const accountKeys = tx.transaction.message.staticAccountKeys || [];
          const hasSage = accountKeys.some(key => key.toString() === SAGE_PROGRAM_ID);
          
          if (!hasSage) continue;
          
          // Extract all accounts - potential fleet candidates
          for (const accountKey of accountKeys) {
            const account = accountKey.toString();
            
            // Skip if already known or system accounts
          if (knownFleetKeys.has(account)) continue;
          if (account === SAGE_PROGRAM_ID) continue;
          if (account === walletAuthority) continue;
          
          fleetCandidates.add(account);
        }
      } catch {
        // Skip failed transactions
      }
    }      console.log(`[tx-analysis] Found ${fleetCandidates.size} potential fleet accounts from transactions`);
      
      // Now verify which candidates are actually fleet accounts (536 bytes, SAGE owner)
      let verifiedCount = 0;
      for (const candidate of fleetCandidates) {
        verifiedCount++;
        if (verifiedCount % 50 === 0) {
          console.log(`[tx-analysis] verified ${verifiedCount}/${fleetCandidates.size} candidates...`);
        }
        
        try {
          const accountInfo = await connection.getAccountInfo(new PublicKey(candidate));
          if (!accountInfo) continue;
          if (accountInfo.data.length !== 536) continue;
          if (accountInfo.owner.toString() !== SAGE_PROGRAM_ID) continue;
          
          // This is a fleet account!
          additionalFleetKeys.add(candidate);
        } catch {
          // Skip invalid accounts
        }
      }
      
      console.log(`[tx-analysis] Found ${additionalFleetKeys.size} verified fleet accounts with recent wallet activity`);
      
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
            walletHeuristicKeys.add(fleetKey);
          }
        } catch (error) {
          console.error(`Error fetching fleet ${fleetKey}:`, error);
        }
      }
    } catch (error) {
      console.error('Error searching for rented fleets:', error);
    }

    // Additionally: mark fleets that clearly show recent usage by this wallet as RENTED if not owned by player
    try {
      const sample = fleets.filter((f: any) => f && (f as any).key).slice(0, Math.min(20, fleets.length));
      for (const f of sample) {
        const fk = (f as any).key.toString();
        try {
          const sigs = await connection.getSignaturesForAddress(new PublicKey(fk), { limit: 2 });
          let usedByWallet = false;
          for (const s of sigs) {
            try {
              const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
              const payer = tx?.transaction.message.accountKeys?.[0]?.pubkey?.toString();
              if (payer === walletAuthority) { usedByWallet = true; break; }
            } catch {}
          }
          if (usedByWallet) operatedByWalletKeys.add(fk);
        } catch {}
      }
      console.log(`Wallet usage evidence on ${operatedByWalletKeys.size} fleets`);
    } catch {}
  }

  // NEW: SRSLY rentals scan - identify fleets referenced by the rentals program for this profile
  try {
    console.log('Scanning SRSLY rentals to augment rented fleets...');
    const srslyProgramKey = new PublicKey(SRSLY_PROGRAM_ID);
    const accounts = await withRetry(() => connection.getProgramAccounts(srslyProgramKey));

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
          srslyHeuristicKeys.add(k);
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

  // Pre-extract owningProfile and subProfile from raw account bytes for robustness
  const keyList: PublicKey[] = fleets
    .filter((f: any) => f && f.type === 'ok' && (f as any).key)
    .map((f: any) => (f as any).key as PublicKey);

  const ownerByKey = new Map<string, string | null>();
  const subByKey = new Map<string, string | null>();
  try {
    const chunkSize = 50;
    for (let i = 0; i < keyList.length; i += chunkSize) {
      const chunk = keyList.slice(i, i + chunkSize);
      const infos = await connection.getMultipleAccountsInfo(chunk);
      for (let j = 0; j < chunk.length; j++) {
        const info = infos[j];
        const k = chunk[j].toBase58();
        if (info?.data && info.data.length >= 105) {
          try {
            const ownerPk = new PublicKey(info.data.slice(41, 73)).toBase58();
            const subPk = new PublicKey(info.data.slice(73, 105)).toBase58();
            ownerByKey.set(k, ownerPk);
            subByKey.set(k, subPk);
          } catch {
            ownerByKey.set(k, null);
            subByKey.set(k, null);
          }
        } else {
          ownerByKey.set(k, null);
          subByKey.set(k, null);
        }
      }
    }
  } catch (e) {
    console.error('Failed to pre-extract owner/subProfile from accounts:', e);
  }

  const fleetsData = fleets
    .filter((f: any) => f.type === 'ok')
    .map((fleet: any) => {
      const subProfile = fleet.data.data.subProfile;
      const owningProfile = fleet.data.data.owningProfile;
      const keyStr = fleet.key.toString();

      // Resolve base58 strings using raw account bytes first, then fallbacks
      const ownerStr = ownerByKey.get(keyStr) ?? (typeof (owningProfile as any)?.toBase58 === 'function'
        ? (owningProfile as any).toBase58()
        : (typeof (owningProfile as any)?.toString === 'function'
          ? (owningProfile as any).toString()
          : null));
      const subStr = subByKey.get(keyStr) ?? (typeof (subProfile as any)?.toBase58 === 'function'
        ? (subProfile as any).toBase58()
        : (typeof (subProfile as any)?.toString === 'function'
          ? (subProfile as any).toString()
          : null));
      
      // A fleet is RENTED when any of the following is true:
      // 1) You are the subProfile (you use it) AND you are NOT the owner
      // 2) It was discovered via wallet heuristic AND it's not owned by you
      // 3) It was discovered via SRSLY rental scan AND it's not owned by you
      const rentedBySubProfile = !!(
        subStr &&
        subStr === playerProfilePubkey.toBase58() &&
        ownerStr &&
        ownerStr !== playerProfilePubkey.toBase58()
      );
      const rentedByWalletHeuristic = !!(
        (walletHeuristicKeys.has(keyStr) || operatedByWalletKeys.has(keyStr)) &&
        // treat unknown owner as not owned by player
        (ownerStr ? (ownerStr !== playerProfilePubkey.toBase58()) : true)
      );
      const rentedBySrsly = !!(
        srslyHeuristicKeys.has(keyStr) &&
        (ownerStr ? (ownerStr !== playerProfilePubkey.toBase58()) : true)
      );
      const isRented = rentedBySubProfile || rentedByWalletHeuristic || rentedBySrsly;

      try {
        const name = byteArrayToString(fleet.data.data.fleetLabel) || '<unnamed>';
        console.log(
          `[fleets] ${name} | key=${keyStr} | owner=${ownerStr} | sub=${subStr} | flags: subMatch=${subStr===playerProfilePubkey.toString()} ownerMatch=${ownerStr===playerProfilePubkey.toString()} walletHeuristic=${walletHeuristicKeys.has(keyStr)} srslyHeuristic=${srslyHeuristicKeys.has(keyStr)} => isRented=${isRented}`
        );
      } catch {}
      
      return {
        callsign: byteArrayToString(fleet.data.data.fleetLabel),
        key: fleet.key.toString(),
        data: fleet.data.data,
        isRented: isRented
      };
    });

  return {
    fleets: fleetsData,
    walletAuthority: walletAuthority
  };
}
