import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import BN from "bn.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { RentalService } from "./rentalService";
import { decodeRentalState } from "./decode";
import { pickOptimisticRentalRate } from "./rentalCacheUtils";
import { RpcPoolManager } from "../../utils/rpc/rpc-pool-manager";

// PATCH: Express endpoint minimale per orchestrare la rental tx
import express from "express";
import fs from "fs";
import path from "path";
const router = express.Router();

const DURATION_SECONDS_BY_UNIT: Record<string, number> = {
  decasecond: 10,
  minute: 60,
  hourly: 3600,
  hour: 3600,
  daily: 86400,
  day: 86400,
  weekly: 604800,
  week: 604800,
  monthly: 2592000,
  month: 2592000,
};

function normalizeDurationUnit(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'decaseconds') return 'decasecond';
  if (normalized.startsWith('min')) return 'minute';
  if (normalized.startsWith('hour')) return 'hourly';
  if (normalized.startsWith('day')) return 'daily';
  if (normalized.startsWith('week')) return 'weekly';
  if (normalized.startsWith('month')) return 'monthly';
  return normalized;
}

function convertDurationToContractUnits(duration: number, requestedUnit: unknown, paymentFrequency: unknown): number {
  const sourceUnit = normalizeDurationUnit(requestedUnit || 'day');
  const targetUnit = normalizeDurationUnit(paymentFrequency);
  const sourceSeconds = DURATION_SECONDS_BY_UNIT[sourceUnit];
  const targetSeconds = DURATION_SECONDS_BY_UNIT[targetUnit];

  if (!sourceSeconds) {
    throw new Error(`Unsupported duration unit: ${requestedUnit}`);
  }

  if (!targetSeconds) {
    return duration;
  }

  const convertedDuration = (duration * sourceSeconds) / targetSeconds;
  if (!Number.isInteger(convertedDuration) || convertedDuration <= 0) {
    throw new Error(`Duration ${duration} ${sourceUnit} is not compatible with payment frequency ${paymentFrequency}`);
  }

  return convertedDuration;
}

function matchesFleetByTxMeta(fleet: any, txMeta: any): boolean {
  const sameFleet = typeof txMeta?.fleet_id === 'string' && (
    fleet?.fleet_id === txMeta.fleet_id
    || fleet?.fleet === txMeta.fleet_id
    || fleet?.pubkey === txMeta.fleet_id
    || fleet?.key === txMeta.fleet_id
    || fleet?.data?.fleetShips === txMeta.fleet_id
  );
  const sameContract = typeof txMeta?.contract === 'string' && (
    fleet?.contractPubkey === txMeta.contract
    || fleet?.contract === txMeta.contract
    || fleet?.address === txMeta.contract
  );
  const sameRentalState = typeof txMeta?.rentalState === 'string' && (
    fleet?.rental_state_pubkey === txMeta.rentalState
    || fleet?.current_rental_state === txMeta.rentalState
    || fleet?.rentalState === txMeta.rentalState
  );
  return sameFleet || sameContract || sameRentalState;
}

function buildListedFleetPreview(currentData: any, txMeta: any): any {
  const fleets = Array.isArray(currentData?.fleets) ? currentData.fleets : [];
  const sourceFleet = fleets.find((fleet: any) => matchesFleetByTxMeta(fleet, txMeta)) ?? null;
  const fleetId = sourceFleet?.key || sourceFleet?.pubkey || sourceFleet?.fleet || txMeta?.fleet_id || null;
  const fleetLabel = sourceFleet?.callsign || sourceFleet?.fleet_label || sourceFleet?.fleet_name || txMeta?.fleet_label || fleetId || 'Unknown';
  const rateRaw = txMeta?.rate ?? sourceFleet?.rate ?? null;
  const parsedRate = rateRaw === null || rateRaw === undefined || rateRaw === '' ? null : Number(rateRaw);
  const durationMinRaw = txMeta?.durationMin ?? sourceFleet?.duration_min ?? 1;
  const durationMaxRaw = txMeta?.durationMax ?? sourceFleet?.duration_max ?? 24;

  return {
    ...(sourceFleet && typeof sourceFleet === 'object' ? sourceFleet : {}),
    fleet: fleetId,
    fleet_id: fleetId,
    key: sourceFleet?.key ?? fleetId,
    pubkey: fleetId,
    fleet_label: fleetLabel,
    callsign: sourceFleet?.callsign ?? fleetLabel,
    isListed: true,
    isLoaned: false,
    isRented: false,
    contractPubkey: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.contractPubkey ?? null,
    contract: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.contract ?? null,
    address: typeof txMeta?.contract === 'string' ? txMeta.contract : sourceFleet?.address ?? null,
    owner_profile: typeof txMeta?.ownerProfile === 'string' ? txMeta.ownerProfile : sourceFleet?.owner_profile ?? null,
    current_rental_state: null,
    rental_state_pubkey: null,
    rate: Number.isFinite(parsedRate as number) ? parsedRate : rateRaw,
    duration_min: Number(durationMinRaw) || 1,
    duration_max: Number(durationMaxRaw) || 24,
    payment_frequency: typeof txMeta?.paymentFrequency === 'string'
      ? String(txMeta.paymentFrequency).replace(/^@/, '')
      : sourceFleet?.payment_frequency ?? 'daily',
    rental_start_time: null,
    rental_end_time: null,
    rental_cancelled: false,
  };
}

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

function normalizeRpcProfileId(value?: string | null): string {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  return cleaned.length > 0 ? cleaned : 'default';
}

function getRpcErrorType(error: unknown): '429' | '503' | 'error' {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (status === 429 || /429|Too Many Requests/i.test(message)) return '429';
  if (status === 503 || /503|Service Unavailable/i.test(message)) return '503';
  return 'error';
}

async function executeRpcWithPool<T>(profileId: string, operation: (connection: Connection) => Promise<T>): Promise<T> {
  const normalizedProfileId = normalizeRpcProfileId(profileId);
  const pool = await RpcPoolManager.loadOrCreateRpcPool(normalizedProfileId);
  const maxAttempts = Math.max(4, Math.round(pool.length * 1.5));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
    const startedAt = Date.now();

    try {
      pick = await RpcPoolManager.pickRpcConnection(normalizedProfileId, {
        waitForMs: 3000,
        allowStale: attempt > 2,
      });
      const result = await operation(pick.connection as Connection);
      pick.release({ success: true, latencyMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      if (pick) {
        pick.release({
          success: false,
          latencyMs: Date.now() - startedAt,
          errorType: getRpcErrorType(error),
        });
      }
      lastError = error;
      console.error(`[rent-rpc] attempt ${attempt + 1}/${maxAttempts} failed for profile ${normalizedProfileId}:`, error);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('RPC request failed');
}

async function getProfileFactionAccount(profilePk: PublicKey, profileId?: string): Promise<PublicKey> {
  const cacheKey = profilePk.toBase58();
  if (profileFactionCache.has(cacheKey)) return profileFactionCache.get(cacheKey)!;
  const accounts = await executeRpcWithPool(profileId || cacheKey, (connection) =>
    connection.getProgramAccounts(PROFILE_FACTION_PROGRAM_ID, {
      filters: [{ memcmp: { offset: 9, bytes: profilePk.toBase58() } }],
    }),
  );
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
      durationUnit,
      profileId // opzionale, per batch fetch health-aware
    } = req.body;

    if (!borrower || !borrowerProfile) {
      res.status(400).json({ error: "Missing required fields: borrower, borrowerProfile" });
      return;
    }

    const quotedRate = Number(amount);
    const requestedDuration = Number(duration);
    const requestedDurationUnit = typeof durationUnit === 'string' ? durationUnit : 'day';
    const rpcProfileId = normalizeRpcProfileId(profileId || borrowerProfile);

    if (!Number.isFinite(quotedRate) || quotedRate <= 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }

    if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
      res.status(400).json({ error: "Invalid duration" });
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

    const contractPaymentFrequency = String(contract?.payment_frequency || 'Daily');

    let contractDuration = requestedDuration;
    try {
      contractDuration = convertDurationToContractUnits(requestedDuration, requestedDurationUnit, contractPaymentFrequency);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
      return;
    }

    console.log("[RENT-FLEET] Duration normalized:", {
      requestedDuration,
      requestedDurationUnit,
      paymentFrequency: contractPaymentFrequency,
      contractDuration,
    });

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

    const borrowerProfileFactionPk = await getProfileFactionAccount(borrowerProfilePk, rpcProfileId);
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

      // Il rate del contratto è espresso nella `payment_frequency`; convertiamo prima la durata e poi calcoliamo il totale atteso dal programma SRSLY.
      const amountAtomics = BigInt(Math.round(quotedRate * contractDuration * 100_000_000));

      // Debug: log dei parametri critici
      console.log("[RENT-FLEET] TX params:", {
        amount: quotedRate,
        amountAtomics: amountAtomics.toString(),
        requestedDuration,
        requestedDurationUnit,
        contractDuration,
        contractPaymentFrequency,
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
        duration: contractDuration,
        rpcProfileId,
      });

      // Patch minimale: imposta feePayer e recentBlockhash per compatibilità wallet
      tx.feePayer = borrowerPk;
      const latestBlockhash = await executeRpcWithPool(rpcProfileId, (connection) =>
        connection.getLatestBlockhash('confirmed'),
      );
      tx.recentBlockhash = latestBlockhash.blockhash;
      // Log oggetto tx DOPO l'assegnazione
      console.log("[RENT-FLEET] TX oggetto dopo feePayer/recentBlockhash:", tx);
      const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');
      console.log("[RENT-FLEET] TX serializzata (base64):", serialized.slice(0, 80) + '...');
      const rentalCacheSeed = {
        profileId: borrowerProfile,
        fleet: contract?.fleet || null,
        fleet_ships: contract?.fleet_ships || null,
        fleet_label: contract?.fleet_name || null,
        isRented: true,
        contractPubkey: contractAddress,
        owner: contract?.owner || null,
        owner_profile: contract?.owner_profile || null,
        owner_token_account: contract?.owner_token_account || null,
        current_rental_state: rentalState.toBase58(),
        rate: contract?.rate ?? quotedRate,
        duration: contractDuration,
        requested_duration: requestedDuration,
        requested_duration_unit: requestedDurationUnit,
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
  const { transaction, contractAddress, rentalState, rentalCacheSeed, txMeta } = req.body;
  if (!transaction || typeof transaction !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid transaction field' });
  }
  try {
    if (txMeta && typeof txMeta === 'object') {
      console.log('[SEND-TX] txMeta:', txMeta);
    }
    const isCancelRent = txMeta?.operation === 'cancel-rent';
    const isDelistFleet = txMeta?.operation === 'delist-fleet';
    const isListFleet = txMeta?.operation === 'list-fleet';
    const isRemovalOp = isCancelRent || isDelistFleet;
    const effectiveContractAddress = typeof contractAddress === 'string'
      ? contractAddress
      : typeof txMeta?.contract === 'string'
        ? txMeta.contract
        : null;
    const effectiveRentalState = typeof rentalState === 'string'
      ? rentalState
      : typeof txMeta?.rentalState === 'string'
        ? txMeta.rentalState
        : null;
    const rawTx = Buffer.from(transaction, 'base64');
    const rpcProfileId = normalizeRpcProfileId(
      (typeof rentalCacheSeed?.profileId === 'string' && rentalCacheSeed.profileId)
      || (typeof txMeta?.profileId === 'string' && txMeta.profileId)
      || undefined,
    );
    console.log('[SEND-TX] Effective tx context:', {
      operation: txMeta?.operation || 'unknown',
      isCancelRent,
      isDelistFleet,
      isListFleet,
      isRemovalOp,
      effectiveContractAddress,
      effectiveRentalState,
      rpcProfileId,
      rawTxBytes: rawTx.length,
    });
    const signature = await executeRpcWithPool(rpcProfileId, (connection) =>
      connection.sendRawTransaction(rawTx, { skipPreflight: false }),
    );
    console.log(`[SEND-TX] TX inviata con successo. Signature: ${signature}`);

    let confirmedRentalState: ReturnType<typeof decodeRentalState> | null = null;
    if (!isRemovalOp && effectiveRentalState) {
      try {
        confirmedRentalState = await executeRpcWithPool(rpcProfileId, async (connection) => {
          await connection.confirmTransaction(signature, 'confirmed');
          const accountInfo = await connection.getAccountInfo(new PublicKey(effectiveRentalState), 'confirmed');
          if (!accountInfo?.data) return null;
          return decodeRentalState(Buffer.from(accountInfo.data));
        });

        if (confirmedRentalState) {
          console.log('[SEND-TX] rental state confermato da chain:', {
            rentalState: effectiveRentalState,
            start_time: confirmedRentalState.start_time,
            end_time: confirmedRentalState.end_time,
            cancelled: confirmedRentalState.cancelled,
          });
        } else {
          console.warn(`[SEND-TX] rental state ${effectiveRentalState} non ancora leggibile dopo la conferma, uso fallback ottimistico`);
        }
      } catch (e: any) {
        console.warn(`[SEND-TX] Impossibile leggere il rental state confermato ${effectiveRentalState}, uso fallback ottimistico: ${e?.message || e}`);
      }
    }

    // Aggiorna current_rental_state in contracts.json sia per acceptRental che per cancelRental
    if (effectiveContractAddress && typeof effectiveContractAddress === 'string') {
      try {
        const contractsPath = path.join(process.cwd(), 'cache', 'contracts.json');
        const contractsObj = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
        const arr: any[] = Array.isArray(contractsObj) ? contractsObj : contractsObj.contracts;
        const idx = arr.findIndex((c: any) => c.address === effectiveContractAddress);
        if (idx !== -1) {
          arr[idx].current_rental_state = isRemovalOp ? null : effectiveRentalState;
          const toWrite = Array.isArray(contractsObj) ? arr : { ...contractsObj, contracts: arr };
          fs.writeFileSync(contractsPath, JSON.stringify(toWrite, null, 2));
          console.log(`[SEND-TX] contracts.json aggiornato: ${effectiveContractAddress} -> current_rental_state: ${isRemovalOp ? 'null' : effectiveRentalState}`);
        } else {
          console.warn(`[SEND-TX] Contratto non trovato in contracts.json per address: ${effectiveContractAddress}`);
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
        const durationNum = Number(rentalCacheSeed.duration ?? 0);
        const frequencyKey = normalizeDurationUnit(rentalCacheSeed.payment_frequency || '');
        const secondsPerUnit = DURATION_SECONDS_BY_UNIT[frequencyKey] ?? 0;
        const computedEndTs = durationNum > 0 && secondsPerUnit > 0 ? nowTs + (durationNum * secondsPerUnit) : null;

        const normalizedSeed = {
          ...rentalCacheSeed,
          isRented: true,
          contractPubkey: rentalCacheSeed.contractPubkey || contractAddress,
          current_rental_state: rentalState,
          rental_state_pubkey: rentalState,
          borrower: confirmedRentalState?.borrower || rentalCacheSeed.borrower,
          rate: pickOptimisticRentalRate(rentalCacheSeed.rate, confirmedRentalState?.rate),
          rental_start_time: confirmedRentalState?.start_time ?? rentalCacheSeed.rental_start_time ?? nowTs,
          rental_end_time: confirmedRentalState?.end_time ?? rentalCacheSeed.rental_end_time ?? computedEndTs,
          rental_cancelled: confirmedRentalState?.cancelled ?? false
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

    if (isListFleet && typeof txMeta?.profileId === 'string') {
      try {
        const latestPath = path.join(process.cwd(), 'cache', txMeta.profileId, 'playload', 'latest.json');
        const latestObj = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        const currentData = latestObj?.data && typeof latestObj.data === 'object' ? latestObj.data : {};
        const rentedFleets = Array.isArray(currentData.rentedFleets) ? currentData.rentedFleets : [];
        const fleets = Array.isArray(currentData.fleets) ? currentData.fleets : [];
        const listedFleet = buildListedFleetPreview(currentData, txMeta);
        const nextRentedFleets = [
          listedFleet,
          ...rentedFleets.filter((fleet: any) => !matchesFleetByTxMeta(fleet, txMeta)),
        ];
        const updatedFleets = fleets.map((fleet: any) => {
          if (!matchesFleetByTxMeta(fleet, txMeta)) return fleet;
          return {
            ...fleet,
            isRented: false,
            isLoaned: false,
            isListed: true,
          };
        });

        const updatedFleetCount = updatedFleets.filter((fleet: any, index: number) => fleets[index] !== fleet).length;
        const toWrite = {
          ...latestObj,
          data: {
            ...currentData,
            rentedFleets: nextRentedFleets,
            fleets: updatedFleets,
          }
        };
        fs.writeFileSync(latestPath, JSON.stringify(toWrite, null, 2));
        console.log('[SEND-TX] playload/latest.json aggiornato (list-fleet append)', {
          profileId: txMeta.profileId,
          fleet: listedFleet.fleet,
          fleet_label: listedFleet.fleet_label,
          rate: listedFleet.rate,
          payment_frequency: listedFleet.payment_frequency,
          rentedFleetsCount: nextRentedFleets.length,
          fleetsUpdated: updatedFleetCount,
        });
      } catch (e: any) {
        console.error('[SEND-TX] Errore append listed fleet a playload/latest.json:', e.message);
      }
    }

    if (isRemovalOp && typeof txMeta?.profileId === 'string') {
      try {
        const latestPath = path.join(process.cwd(), 'cache', txMeta.profileId, 'playload', 'latest.json');
        const latestObj = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        const currentData = latestObj?.data && typeof latestObj.data === 'object' ? latestObj.data : {};
        const rentedFleets = Array.isArray(currentData.rentedFleets) ? currentData.rentedFleets : [];
        const fleets = Array.isArray(currentData.fleets) ? currentData.fleets : [];

        const filteredRentedFleets = rentedFleets.filter((fleet: any) => !matchesFleetByTxMeta(fleet, txMeta));
        const updatedFleets = fleets.map((fleet: any) => {
          if (!matchesFleetByTxMeta(fleet, txMeta)) return fleet;
          return {
            ...fleet,
            isRented: false,
            isLoaned: false,
            isListed: false,
          };
        });

        const removedCount = rentedFleets.length - filteredRentedFleets.length;
        const updatedFleetCount = updatedFleets.filter((fleet: any, index: number) => fleets[index] !== fleet).length;
        const toWrite = {
          ...latestObj,
          data: {
            ...currentData,
            rentedFleets: filteredRentedFleets,
            fleets: updatedFleets,
          }
        };
        fs.writeFileSync(latestPath, JSON.stringify(toWrite, null, 2));
        console.log(`[SEND-TX] playload/latest.json aggiornato (${isDelistFleet ? 'delist-fleet remove' : 'cancel-rent remove'}) per profile ${txMeta.profileId}, removed=${removedCount}, fleetsUpdated=${updatedFleetCount}`);
      } catch (e: any) {
        console.error('[SEND-TX] Errore rimozione rented fleet da playload/latest.json:', e.message);
      }
    }
    res.json({ signature });
  } catch (err: any) {
    console.error('[SEND-TX] Error:', err);
    const simulationLogs = err?.logs || err?.data?.logs || err?.value?.logs || null;
    const simulationErr = err?.data?.err || err?.value?.err || err?.simulationResponse?.err || null;
    const instructionError = simulationErr?.InstructionError || null;

    if (txMeta && typeof txMeta === 'object') {
      console.error('[SEND-TX] txMeta on failure:', txMeta);
    }
    if (simulationErr) {
      console.error('[SEND-TX] Simulation err:', simulationErr);
    }
    if (instructionError) {
      console.error('[SEND-TX] InstructionError:', instructionError);
    }
    if (Array.isArray(simulationLogs)) {
      console.error('[SEND-TX] Simulation logs:');
      for (const line of simulationLogs) {
        console.error('[SEND-TX][SIM-LOG]', line);
      }
    }

    res.status(500).json({
      error: err.message || String(err),
      txMeta: txMeta || null,
      simulationErr,
      simulationLogs,
      instructionError,
    });
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
    duration,
    rpcProfileId,
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

  let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
  try {
    pick = await RpcPoolManager.pickRpcConnection(
      normalizeRpcProfileId(rpcProfileId || toPk(borrower_profile).toBase58()),
      { waitForMs: 3000, allowStale: true },
    );
    const provider = new anchor.AnchorProvider(pick.connection as Connection, dummyWallet as any, anchor.AnchorProvider.defaultOptions());
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
    pick.release({ success: true });
    console.log("[acceptRentalTx] Instruction data (hex):", tx.instructions[0].data?.toString('hex') || "N/A");
    console.log("[acceptRentalTx] BN values - amount:", new BN(amount).toString(), "duration:", new BN(duration).toString());
    console.log("[acceptRentalTx] TX oggetto:", tx);
    return tx;
  } catch (error) {
    if (pick) {
      pick.release({ success: false, errorType: getRpcErrorType(error) });
    }
    throw error;
  }
}
