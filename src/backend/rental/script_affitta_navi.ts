import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import BN from "bn.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { RentalService } from "./rentalService";
import { getRpcConnection } from "../../utils/rpc/connection";

// PATCH: Express endpoint minimale per orchestrare la rental tx
import express from "express";
import fs from "fs";
import path from "path";
const router = express.Router();

function normalizeInstructionAccounts(accounts: any[]): any[] {
  return accounts.map((acc) => {
    if (acc.accounts && Array.isArray(acc.accounts)) {
      return {
        ...acc,
        accounts: normalizeInstructionAccounts(acc.accounts),
      };
    }
    return {
      ...acc,
      isMut: acc.isMut ?? acc.writable ?? false,
      isSigner: acc.isSigner ?? acc.signer ?? false,
      isOptional: acc.isOptional ?? acc.optional ?? false,
    };
  });
}

function normalizeIdlType(type: any): any {
  if (typeof type === "string") {
    return type === "pubkey" ? "publicKey" : type;
  }
  if (!type || typeof type !== "object") {
    return type;
  }
  if ("vec" in type) {
    return { vec: normalizeIdlType(type.vec) };
  }
  if ("option" in type) {
    return { option: normalizeIdlType(type.option) };
  }
  if ("array" in type && Array.isArray(type.array)) {
    return { array: [normalizeIdlType(type.array[0]), type.array[1]] };
  }
  if ("defined" in type) {
    const defined = type.defined;
    if (typeof defined === "string") {
      return { defined };
    }
    if (defined && typeof defined === "object" && typeof defined.name === "string") {
      return { defined: defined.name };
    }
  }
  return type;
}

function normalizeTypeDef(typeDef: any): any {
  if (!typeDef?.type?.kind) {
    return typeDef;
  }

  if (typeDef.type.kind === "struct") {
    return {
      ...typeDef,
      type: {
        ...typeDef.type,
        fields: (typeDef.type.fields ?? []).map((field: any) => ({
          ...field,
          type: normalizeIdlType(field.type),
        })),
      },
    };
  }

  if (typeDef.type.kind === "enum") {
    return {
      ...typeDef,
      type: {
        ...typeDef.type,
        variants: (typeDef.type.variants ?? []).map((variant: any) => ({
          ...variant,
          fields: Array.isArray(variant.fields)
            ? variant.fields.map((field: any) => {
              if (field && typeof field === "object" && "type" in field) {
                return { ...field, type: normalizeIdlType(field.type) };
              }
              return normalizeIdlType(field);
            })
            : variant.fields,
        })),
      },
    };
  }

  return typeDef;
}

function toLegacyAnchorIdl(rawIdl: any): anchor.Idl {
  const types = Array.isArray(rawIdl.types) ? rawIdl.types.map(normalizeTypeDef) : [];
  const typeByName = new Map(types.map((t: any) => [t.name, t.type]));

  const accounts = Array.isArray(rawIdl.accounts)
    ? rawIdl.accounts.map((acc: any) => {
      const type = acc.type ?? typeByName.get(acc.name);
      if (!type) {
        throw new Error(`[IDL] Missing type for account ${acc.name}`);
      }
      return {
        ...acc,
        type,
      };
    })
    : undefined;

  const instructions = Array.isArray(rawIdl.instructions)
    ? rawIdl.instructions.map((ix: any) => ({
      ...ix,
      args: (ix.args ?? []).map((arg: any) => ({
        ...arg,
        type: normalizeIdlType(arg.type),
      })),
      accounts: normalizeInstructionAccounts(ix.accounts ?? []),
    }))
    : [];

  return {
    ...rawIdl,
    version: rawIdl.version ?? rawIdl.metadata?.version ?? "0.1.0",
    name: rawIdl.name ?? rawIdl.metadata?.name ?? "unknown_program",
    instructions,
    accounts,
    types,
  } as anchor.Idl;
}

const srslyLegacyIdl = toLegacyAnchorIdl(srslyIdl);

const PROFILE_FACTION_PROGRAM_ID = new PublicKey("pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq");
// Cache profile -> faction account pubkey (cleared on server restart only)
const profileFactionCache = new Map<string, PublicKey>();
async function getProfileFactionAccount(profilePk: PublicKey): Promise<PublicKey> {
  const cacheKey = profilePk.toBase58();
  if (profileFactionCache.has(cacheKey)) return profileFactionCache.get(cacheKey)!;
  const connection = await getRpcConnection();
  const accounts = await connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 9, bytes: profilePk.toBase58() } }],
  });
  if (accounts.length === 0) throw new Error(`No profile faction account found for profile ${cacheKey}`);
  const result = accounts[0].pubkey;
  profileFactionCache.set(cacheKey, result);
  console.log("[FACTION] Fetched profileFaction for", cacheKey, "->", result.toBase58());
  return result;
}

// Carica contracts.json una sola volta (in produzione meglio usare cache o fetch dinamico)
//const contractsCache = JSON.parse(fs.readFileSync("cache/contracts.json", "utf8"));
let contractsCache: any = null;


const rentalService = new RentalService(new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT"), 30000);



router.post("/rent-fleet", async (req, res) => {
  try {
    console.log("[RENT-FLEET] Chiamata ricevuta con body:", req.body);
    const {
      contractAddress,
      borrower,
      borrowerProfile,
      amount,
      duration,
      profileId // opzionale, per batch fetch health-aware
    } = req.body;

    if (!borrower || !borrowerProfile) {
      res.status(400).json({ error: "Missing required fields: borrower, borrowerProfile" });
      return;
    }

    // Trova il contratto solo se la cache è disponibile, altrimenti prosegui come in main
    let contract = null;
    try {
      const data = fs.readFileSync("cache/contracts.json", "utf8");
      contractsCache = JSON.parse(data);
      console.log("[INIT] Contracts cache caricata con successo, totale contratti:", Array.isArray(contractsCache) ? contractsCache.length : (contractsCache.contracts ? contractsCache.contracts.length : 0));
    } catch (err) {
      console.error("[INIT] Errore durante il caricamento della cache dei contratti:", err);
    }
    if (contractsCache) {
      const contractArr = Array.isArray(contractsCache) ? contractsCache : contractsCache.contracts;
      contract = contractArr.find((c) => c.address === contractAddress);
      if (!contract) {
        res.status(404).json({ error: "Contract not found" });
        return;
      }
      console.log("[RENT-FLEET] Contratto trovato:", contract);
    } else {
      // Comportamento fallback: log e prosegui (come branch main)
      console.warn("[RENT-FLEET] ATTENZIONE: contractsCache è null, proseguo senza enrich da cache (comportamento main)");
      // Qui puoi aggiungere logica alternativa se serve, oppure lasciare che il resto del flusso usi i parametri ricevuti
      // Se serve un contract oggetto, puoi costruirne uno minimale dai parametri della request (se necessario)
      contract = {
        fleet: req.body.fleet,
        game_id: req.body.game_id,
        faction: req.body.faction || 1 // default mud
      };
    }

    // Derivazione PDA fedele all'esempio ufficiale
    const fleetPk = new PublicKey(contract.fleet);
    const gameIdPk = new PublicKey(contract.game_id);
    const borrowerPk = new PublicKey(borrower);
    const borrowerProfilePk = new PublicKey(borrowerProfile);
    const mintPk = new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx");
    const srslyProgramId = SRSLY_PROGRAM_ID;
    const antigenProgramId = new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1");
    const sageProgramId = new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE");
    const SLY_SQUADS = new PublicKey("FEESnQG5d8UmUUbogJUaiQjMZpRQ9fCEDf3nBRf1ut9M");

    // contractPda
    const [contractPda] = await PublicKey.findProgramAddress([
      Buffer.from("rental_contract"), fleetPk.toBuffer()
    ], srslyProgramId);
    // rentalAuthority
    const [rentalAuthority] = await PublicKey.findProgramAddress([
      Buffer.from("rental_authority")
    ], srslyProgramId);
    // rentalState
    const [rentalState] = await PublicKey.findProgramAddress([
      Buffer.from("rental_state"), contractPda.toBuffer(), borrowerPk.toBuffer()
    ], srslyProgramId);
    // rentalThread
    const [rentalThread] = await PublicKey.findProgramAddress([
      Buffer.from("thread"), rentalAuthority.toBuffer(), rentalState.toBuffer()
    ], antigenProgramId);
    // sagePlayerProfile
    const [sagePlayerProfile] = await PublicKey.findProgramAddress([
      Buffer.from("sage_player_profile"), borrowerProfilePk.toBuffer(), gameIdPk.toBuffer()
    ], sageProgramId);

    const borrowerProfileFactionPk = await getProfileFactionAccount(borrowerProfilePk);
    console.log("[RENT-FLEET] borrowerProfileFaction:", borrowerProfileFactionPk.toBase58());

    // Fazione e coordinate starbase (dummy, da fetchare se serve, qui mud)
    const factionCoords = { mud: { x: 0, y: -39 }, oni: { x: -40, y: 30 }, ustur: { x: 40, y: 30 } };
    const faction = contract.faction === 1 ? "mud" : contract.faction === 2 ? "oni" : "ustur";
    const coords = factionCoords[faction] || factionCoords.mud;
    const xBN = new BN(coords.x);
    const yBN = new BN(coords.y);
    // starbase PDA
    const [starbasePda] = await PublicKey.findProgramAddress([
      Buffer.from("Starbase"), gameIdPk.toBuffer(), xBN.toTwos(64).toArrayLike(Buffer, "le", 8), yBN.toTwos(64).toArrayLike(Buffer, "le", 8)
    ], sageProgramId);

    // starbasePlayer PDA
    const zero2 = Buffer.alloc(2, 0);
    const [starbasePlayer] = await PublicKey.findProgramAddress([
      Buffer.from("starbase_player"), starbasePda.toBuffer(), sagePlayerProfile.toBuffer(), zero2
    ], sageProgramId);

    // Token accounts
    const borrowerTokenAccount = await getAssociatedTokenAddress(
      mintPk, borrowerPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const rentalTokenAccount = await getAssociatedTokenAddress(
      mintPk, rentalState, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const feeTokenAccount = await getAssociatedTokenAddress(
      mintPk, SLY_SQUADS, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Log PDAs
    console.log("[RENT-FLEET] PDAs:", {
      contractPda: contractPda.toBase58(),
      rentalAuthority: rentalAuthority.toBase58(),
      rentalState: rentalState.toBase58(),
      rentalThread: rentalThread.toBase58(),
      sagePlayerProfile: sagePlayerProfile.toBase58(),
      starbasePda: starbasePda.toBase58(),
      starbasePlayer: starbasePlayer.toBase58(),
      borrowerTokenAccount: borrowerTokenAccount.toBase58(),
      rentalTokenAccount: rentalTokenAccount.toBase58(),
      feeTokenAccount: feeTokenAccount.toBase58()
    });

    // Costruisci la tx fedele all'esempio ufficiale
    try {

      // amount dal frontend è la tariffa giornaliera in ATLAS; il programma SRSLY attende il totale (rate × duration) in atomics
      const amountAtomics = BigInt(Math.round(Number(amount) * Number(duration) * 100_000_000));

      // Debug: log dei parametri critici
      console.log("[RENT-FLEET] TX params:", {
        amount: amount,
        amountAtomics: amountAtomics.toString(),
        duration: duration,
        durationType: typeof duration,
        borrower: borrowerPk.toBase58(),
        borrowerProfile: borrowerProfilePk.toBase58(),
        contractPda: contractPda.toBase58()
      });

      // Costruisci la custom instruction acceptRental
      const tx = await acceptRentalTx({
        mint: mintPk,
        borrower: borrowerPk,
        borrower_profile: borrowerProfilePk,
        borrower_profile_faction: borrowerProfileFactionPk,
        borrower_token_account: borrowerTokenAccount,
        fleet: fleetPk,
        game_id: gameIdPk,
        starbase: starbasePda,
        starbase_player: starbasePlayer,
        contract: contractPda,
        rental_state: rentalState,
        rental_authority: rentalAuthority,
        rental_token_account: rentalTokenAccount,
        rental_thread: rentalThread,
        fee_token_account: feeTokenAccount,
        sage_program: sageProgramId,
        antegen_program: antigenProgramId,
        token_program: TOKEN_PROGRAM_ID,
        associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
        system_program: SystemProgram.programId,
        amount: amountAtomics.toString(),
        duration
      });

      // Patch minimale: imposta feePayer e recentBlockhash per compatibilità wallet
      tx.feePayer = borrowerPk;
      const connection = await getRpcConnection();
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // Log oggetto tx DOPO l'assegnazione
      console.log("[RENT-FLEET] TX oggetto dopo feePayer/recentBlockhash:", tx);
      const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');
      console.log("[RENT-FLEET] TX serializzata (base64):", serialized.slice(0, 80) + '...');
      const rentalCacheSeed = {
        profileId: borrowerProfile,
        fleet: contract?.fleet || null,
        fleet_label: contract?.fleet_name || null,
        isRented: true,
        contractPubkey: contractAddress,
        owner: contract?.owner || null,
        owner_profile: contract?.owner_profile || null,
        owner_token_account: contract?.owner_token_account || null,
        current_rental_state: rentalState.toBase58(),
        rate: contract?.rate ?? Number(amount),
        duration_min: contract?.duration_min ?? null,
        duration_max: contract?.duration_max ?? null,
        payment_frequency: contract?.payment_frequency || null,
        borrower: borrower,
        rental_state_pubkey: rentalState.toBase58(),
        rental_cancelled: false
      };
      res.json({ transaction: serialized, contractAddress, rentalState: rentalState.toBase58(), rentalCacheSeed });
    } catch (err) {
      console.error("[RENT-FLEET] Errore durante la creazione/serializzazione della tx:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Broadcast tx firmata usando il pool RPC del backend
router.post('/send-tx', async (req, res) => {
  const { transaction, contractAddress, rentalState, rentalCacheSeed } = req.body;
  if (!transaction || typeof transaction !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid transaction field' });
  }
  try {
    const rawTx = Buffer.from(transaction, 'base64');
    const connection = await getRpcConnection();
    const signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
    console.log(`[SEND-TX] TX inviata con successo. Signature: ${signature}`);
    // Aggiorna current_rental_state in contracts.json se forniti contractAddress e rentalState
    if (contractAddress && typeof contractAddress === 'string' && rentalState && typeof rentalState === 'string') {
      try {
        const contractsPath = path.join(process.cwd(), 'cache', 'contracts.json');
        const contractsObj = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
        const arr: any[] = Array.isArray(contractsObj) ? contractsObj : contractsObj.contracts;
        const idx = arr.findIndex((c: any) => c.address === contractAddress);
        if (idx !== -1) {
          arr[idx].current_rental_state = rentalState;
          const toWrite = Array.isArray(contractsObj) ? arr : { ...contractsObj, contracts: arr };
          fs.writeFileSync(contractsPath, JSON.stringify(toWrite, null, 2));
          console.log(`[SEND-TX] contracts.json aggiornato: ${contractAddress} -> current_rental_state: ${rentalState}`);
        } else {
          console.warn(`[SEND-TX] Contratto non trovato in contracts.json per address: ${contractAddress}`);
        }
      } catch (e: any) {
        console.error('[SEND-TX] Errore aggiornamento contracts.json:', e.message);
      }
    }

    // Aggiorna in-place playload/latest.json per visualizzare subito la borrowed in UI (senza fetch RPC)
    if (rentalCacheSeed && typeof rentalCacheSeed === 'object' && typeof rentalCacheSeed.profileId === 'string') {
      try {
        const latestPath = path.join(process.cwd(), 'cache', rentalCacheSeed.profileId, 'playload', 'latest.json');
        const latestObj = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        const currentData = latestObj?.data && typeof latestObj.data === 'object' ? latestObj.data : {};
        const rentedFleets = Array.isArray(currentData.rentedFleets) ? currentData.rentedFleets : [];
        const nowTs = Math.floor(Date.now() / 1000);

        const normalizedSeed = {
          ...rentalCacheSeed,
          isRented: true,
          contractPubkey: rentalCacheSeed.contractPubkey || contractAddress,
          current_rental_state: rentalState,
          rental_state_pubkey: rentalState,
          rental_start_time: rentalCacheSeed.rental_start_time ?? nowTs,
          rental_end_time: rentalCacheSeed.rental_end_time ?? null,
          rental_cancelled: false
        };

        const idx = rentedFleets.findIndex((f: any) =>
          (f?.contractPubkey && normalizedSeed.contractPubkey && f.contractPubkey === normalizedSeed.contractPubkey)
          || (f?.rental_state_pubkey && f.rental_state_pubkey === rentalState)
        );

        if (idx !== -1) {
          rentedFleets[idx] = { ...rentedFleets[idx], ...normalizedSeed };
        } else {
          rentedFleets.unshift(normalizedSeed);
        }

        const toWrite = {
          ...latestObj,
          data: {
            ...currentData,
            rentedFleets
          }
        };
        fs.writeFileSync(latestPath, JSON.stringify(toWrite, null, 2));
        console.log(`[SEND-TX] playload/latest.json aggiornato (borrowed append) per profile ${rentalCacheSeed.profileId}`);
      } catch (e: any) {
        console.error('[SEND-TX] Errore aggiornamento playload/latest.json:', e.message);
      }
    }
    res.json({ signature });
  } catch (err: any) {
    console.error('[SEND-TX] Error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

export default router;

// Parametri principali
const SRSLY_PROGRAM_ID = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");

// PATCH: wallet va gestito in modo sicuro, qui placeholder
const wallet = "";//Keypair.fromSecretKey(/* ... */);



// PATCH: funzione riutilizzabile per orchestrare la tx AcceptRental
// Costruisce la transazione rental senza firmarla e la restituisce

export async function acceptRentalTx(params: any) {
  // Helper: se è stringa, converte in PublicKey, altrimenti lascia
  const toPk = (v: any) => (typeof v === "string" ? new PublicKey(v) : v);
  const {
    mint,
    borrower,
    borrower_profile,
    borrower_profile_faction,
    borrower_token_account,
    fleet,
    game_id,
    starbase,
    starbase_player,
    contract,
    rental_state,
    rental_authority,
    rental_token_account,
    rental_thread,
    fee_token_account,
    sage_program,
    antegen_program,
    token_program,
    associated_token_program,
    system_program,
    amount,
    duration
  } = params;
  // Minimal debug: print all params before toBase58 conversion
  console.log("[acceptRentalTx] RAW params:", params);
  // Log all parameters with correct snake_case names
  console.log("[acceptRentalTx] params:", {
    mint: toPk(mint).toBase58(),
    borrower: toPk(borrower).toBase58(),
    borrower_profile: toPk(borrower_profile).toBase58(),
    borrower_profile_faction: toPk(borrower_profile_faction).toBase58(),
    borrower_token_account: toPk(borrower_token_account).toBase58(),
    fleet: toPk(fleet).toBase58(),
    game_id: toPk(game_id).toBase58(),
    starbase: toPk(starbase).toBase58(),
    starbase_player: toPk(starbase_player).toBase58(),
    contract: toPk(contract).toBase58(),
    rental_state: toPk(rental_state).toBase58(),
    rental_authority: toPk(rental_authority).toBase58(),
    rental_token_account: toPk(rental_token_account).toBase58(),
    rental_thread: toPk(rental_thread).toBase58(),
    fee_token_account: toPk(fee_token_account).toBase58(),
    sage_program: toPk(sage_program).toBase58(),
    antegen_program: toPk(antegen_program).toBase58(),
    token_program: toPk(token_program).toBase58(),
    associated_token_program: toPk(associated_token_program).toBase58(),
    system_program: toPk(system_program).toBase58(),
    amount,
    duration
  });
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any) => txs,
  };
  const connection = await getRpcConnection();
  const provider = new anchor.AnchorProvider(connection, dummyWallet as any, anchor.AnchorProvider.defaultOptions());
  const program = new anchor.Program(srslyLegacyIdl, SRSLY_PROGRAM_ID, provider);
  const tx = await program.methods.acceptRental(new BN(amount), new BN(duration)).accountsStrict({
    mint: toPk(mint),
    borrower: toPk(borrower),
    borrower_profile: toPk(borrower_profile),
    borrower_profile_faction: toPk(borrower_profile_faction),
    borrower_token_account: toPk(borrower_token_account),
    fleet: toPk(fleet),
    game_id: toPk(game_id),
    starbase: toPk(starbase),
    starbase_player: toPk(starbase_player),
    contract: toPk(contract),
    rental_state: toPk(rental_state),
    rental_authority: toPk(rental_authority),
    rental_token_account: toPk(rental_token_account),
    rental_thread: toPk(rental_thread),
    fee_token_account: toPk(fee_token_account),
    sage_program: toPk(sage_program),
    antegen_program: toPk(antegen_program),
    token_program: toPk(token_program),
    associated_token_program: toPk(associated_token_program),
    system_program: toPk(system_program),
  }).transaction();
  console.log("[acceptRentalTx] Instruction data (hex):", tx.instructions[0].data?.toString('hex') || "N/A");
  console.log("[acceptRentalTx] BN values - amount:", new BN(amount).toString(), "duration:", new BN(duration).toString());
  console.log("[acceptRentalTx] TX oggetto:", tx);
  return tx;
}
