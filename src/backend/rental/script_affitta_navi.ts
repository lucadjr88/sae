import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { RentalService } from "./rentalService.js";
import { decodeRentalState } from "./decode.js";
import { buildListedFleetPreview, matchesFleetByTxMeta, pickOptimisticRentalRate } from "./rentalCacheUtils.js";
import { waitForRentalConfirmation } from "./confirmTransaction.js";
import { executeRentalRpc as executeRpcWithPool } from "./rentalRpc.js";
import { acceptRentalTx, SRSLY_PROGRAM_ID } from "./acceptRentalTx.js";
import { convertDurationToContractUnits, DURATION_SECONDS_BY_UNIT, normalizeDurationUnit } from "./rentalDuration.js";
import { getVerifiedSignedTxFromLocals, prepareTxForWalletSignature, requireVerifiedTxSignature } from "../security/txSigningMiddleware.js";

// PATCH: Express endpoint minimale per orchestrare la rental tx
import express from "express";
import fs from "fs";
import path from "path";
const router = express.Router();
export { acceptRentalTx } from "./acceptRentalTx.js";

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

async function getProfileFactionAccount(profilePk: PublicKey, profileId?: string): Promise<PublicKey> {
  const cacheKey = profilePk.toBase58();
  if (profileFactionCache.has(cacheKey)) return profileFactionCache.get(cacheKey)!;

  const normalizedProfileId = normalizeRpcProfileId(profileId || cacheKey);
  const cacheCandidates = [
    path.join(process.cwd(), 'cache', normalizedProfileId, `${normalizedProfileId}.json`),
    path.join(process.cwd(), 'cache', normalizedProfileId, 'playload', 'latest.json'),
  ];

  for (const cacheFile of cacheCandidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const data = raw?.data || raw || {};
      const factionAccount = typeof data.profileFactionAccount === 'string'
        ? data.profileFactionAccount.trim()
        : '';

      if (!factionAccount) {
        continue;
      }

      const result = new PublicKey(factionAccount);
      profileFactionCache.set(cacheKey, result);
      console.log('[FACTION] Loaded profileFaction from cache for', normalizedProfileId, '->', result.toBase58());
      return result;
    } catch {
      // try next cache candidate
    }
  }

  throw new Error(`Missing cached profileFactionAccount for profile ${normalizedProfileId}; run analyze-profile first`);
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

    const contractPda = new PublicKey(contractAddress);
    // rentalAuthority
    const [rentalAuthority] = await PublicKey.findProgramAddress([
      Buffer.from("rental_authority")
    ], srslyProgramId);
    // rentalState
    const [rentalState] = await PublicKey.findProgramAddress([
      Buffer.from("rental_state"), contractPda.toBuffer(), Buffer.from("active")
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
      const rateAtomics = BigInt(Math.round(quotedRate * 100_000_000));
      const durationSeconds = requestedDuration * DURATION_SECONDS_BY_UNIT[normalizeDurationUnit(requestedDurationUnit)];

      // Debug: log dei parametri critici
      console.log("[RENT-FLEET] TX params:", {
        amount: quotedRate,
        rateAtomics: rateAtomics.toString(),
        durationSeconds,
        requestedDuration,
        requestedDurationUnit,
        contractDuration,
        contractPaymentFrequency,
        borrower: borrowerPk.toBase58(),
        borrowerProfile: borrowerProfilePk.toBase58(),
        contractPda: contractPda.toBase58()
      });

      // Build with the current SRSLY IDL-derived instruction layout.
      const tx = await acceptRentalTx({
        borrower: borrowerPk,
        contract: contractPda,
        borrowerProfile: borrowerProfilePk,
        rate: rateAtomics,
        durationSeconds,
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
      const simulation = await executeRpcWithPool(rpcProfileId, (connection) =>
        connection.simulateTransaction(tx),
      );
      if (simulation.value.err) {
        console.error("[RENT-FLEET] Simulation failed:", simulation.value.err, simulation.value.logs);
        res.status(400).json({
          error: "Rent transaction simulation failed",
          simulationErr: simulation.value.err,
          simulationLogs: simulation.value.logs ?? [],
        });
        return;
      }
      const signingPayload = prepareTxForWalletSignature({
        tx,
        signer: borrowerPk,
        operation: 'rent-fleet',
        profileId: rpcProfileId,
        meta: {
          contractAddress,
          rentalState: rentalState.toBase58(),
          borrower: borrowerPk.toBase58(),
        },
      });
      console.log("[RENT-FLEET] TX serializzata (base64):", signingPayload.transaction.slice(0, 80) + '...');
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
      res.json({
        ...signingPayload,
        contractAddress,
        rentalState: rentalState.toBase58(),
        rentalCacheSeed,
      });
    } catch (err) {
      console.error("[RENT-FLEET] Errore durante la creazione/serializzazione della tx:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Broadcast tx firmata usando il pool RPC del backend
router.post('/send-tx', requireVerifiedTxSignature(), async (req, res) => {
  const { transaction, signingRequestId, contractAddress, rentalState, rentalCacheSeed, txMeta } = req.body;
  try {
    if (txMeta && typeof txMeta === 'object') {
      console.log('[SEND-TX] txMeta:', txMeta);
    }
    const { rawTx, expectedSigner, operation: verifiedOperation, record: signingRecord } = getVerifiedSignedTxFromLocals(res);
    const trustedMeta = signingRecord.meta && typeof signingRecord.meta === 'object' ? signingRecord.meta : {};
    const effectiveOperation = verifiedOperation || (typeof txMeta?.operation === 'string' ? txMeta.operation : 'unknown');
    if (typeof txMeta?.operation === 'string' && txMeta.operation !== effectiveOperation) {
      console.warn('[SEND-TX] client txMeta.operation differs from verified signing record', {
        clientOperation: txMeta.operation,
        verifiedOperation: effectiveOperation,
        signingRequestId,
      });
    }
    const isCancelRent = effectiveOperation === 'cancel-rent';
    const isDelistFleet = effectiveOperation === 'delist-fleet';
    const isListFleet = effectiveOperation === 'list-fleet';
    const isRemovalOp = isCancelRent || isDelistFleet;
    const effectiveContractAddress = typeof trustedMeta.contractAddress === 'string'
      ? trustedMeta.contractAddress
      : typeof trustedMeta.contract === 'string'
        ? trustedMeta.contract
        : typeof contractAddress === 'string'
          ? contractAddress
          : typeof txMeta?.contract === 'string'
            ? txMeta.contract
            : null;
    const effectiveRentalState = typeof trustedMeta.rentalState === 'string'
      ? trustedMeta.rentalState
      : typeof rentalState === 'string'
        ? rentalState
        : typeof txMeta?.rentalState === 'string'
          ? txMeta.rentalState
          : null;
    const rpcProfileId = normalizeRpcProfileId(
      signingRecord.profileId
      || (typeof rentalCacheSeed?.profileId === 'string' && rentalCacheSeed.profileId)
      || (typeof txMeta?.profileId === 'string' && txMeta.profileId)
      || undefined,
    );
    console.log('[SEND-TX] Effective tx context:', {
      operation: effectiveOperation,
      expectedSigner,
      signingRequestId,
      signingMessageHash: signingRecord.messageHash,
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

    try {
      const confirmationSource = await waitForRentalConfirmation(executeRpcWithPool, rpcProfileId, signature, {
        rentalState: !isRemovalOp ? effectiveRentalState : null,
      });
      console.log(`[SEND-TX] conferma on-chain rilevata via ${confirmationSource}: ${signature}`);
    } catch (e: any) {
      const message = e?.message || String(e);
      if (/failed on chain/i.test(message)) {
        throw e;
      }
      console.warn(`[SEND-TX] Conferma RPC non ottenuta in tempo per ${signature}, continuo con verifica stato/cache: ${message}`);
    }

    let confirmedRentalState: ReturnType<typeof decodeRentalState> | null = null;
    if (!isRemovalOp && effectiveRentalState) {
      try {
        confirmedRentalState = await executeRpcWithPool(rpcProfileId, async (connection) => {
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
