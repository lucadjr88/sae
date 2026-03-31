import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import BN from "bn.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import srslyIdl from "../idl/srsly_idl.json" assert { type: "json" };
import { RentalService } from "./rentalService";

// PATCH: Express endpoint minimale per orchestrare la rental tx
import express from "express";
import fs from "fs";
const router = express.Router();

// Carica contracts.json una sola volta (in produzione meglio usare cache o fetch dinamico)
const contractsCache = JSON.parse(fs.readFileSync("cache/contracts.json", "utf8"));
const rentalService = new RentalService(new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT"), 30000);



router.post("/rent-fleet", async (req, res) => {
  try {
    console.log("[RENT-FLEET] Chiamata ricevuta con body:", req.body);
    const {
      contractAddress,
      borrowerProfile,
      amount,
      duration,
      profileId // opzionale, per batch fetch health-aware
    } = req.body;

    // Trova il contratto
    const contractArr = Array.isArray(contractsCache) ? contractsCache : contractsCache.contracts;
    const contract = contractArr.find((c) => c.address === contractAddress);
    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }
    console.log("[RENT-FLEET] Contratto trovato:", contract);

    // Derivazione PDA fedele all'esempio ufficiale
    const fleetPk = new PublicKey(contract.fleet);
    const gameIdPk = new PublicKey(contract.game_id);
    const borrowerPk = new PublicKey(borrowerProfile);
    const mintPk = new PublicKey("ATLASX6Ds5Z5iFv7Qq5tFQw1kQnX2U1QnX2U1QnX2U1Q");
    const srslyProgramId = SRSLY_PROGRAM_ID;
    const antigenProgramId = new PublicKey("ANTEGEN111111111111111111111111111111111111");
    const sageProgramId = new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE");

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
      Buffer.from("sage_player_profile"), borrowerPk.toBuffer(), gameIdPk.toBuffer()
    ], sageProgramId);

    // ProfileFactionAccount: derivazione PDA minimale (placeholder fedele all'esempio)
    const [borrowerProfileFaction] = await PublicKey.findProgramAddress([
      Buffer.from("profile_faction"), borrowerPk.toBuffer()
    ], srslyProgramId);
    console.log("[RENT-FLEET] borrowerProfileFaction PDA:", borrowerProfileFaction.toBase58());

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
    // feeTokenAccount: SLY_SQUADS non disponibile, fallback rentalTokenAccount
    const feeTokenAccount = rentalTokenAccount;

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

      // Forza amount a 1 ATLAS (6 decimali)
      const forcedAmount = 1_000_000n;
      const { createTransferInstruction } = await import("@solana/spl-token");
      console.log("[DEBUG] SPL Transfer: from", borrowerTokenAccount.toBase58(), "to", rentalTokenAccount.toBase58(), "owner", borrowerPk.toBase58(), "amount", forcedAmount.toString());
      const transferIx = createTransferInstruction(
        borrowerTokenAccount,
        rentalTokenAccount,
        borrowerPk,
        forcedAmount,
        [],
        TOKEN_PROGRAM_ID
      );

      // Costruisci la custom instruction acceptRental
      const tx = await acceptRentalTx({
        mint: mintPk,
        borrower: borrowerPk,
        borrower_profile: borrowerProfile,
        borrower_profile_faction: borrowerProfileFaction,
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
        amount,
        duration
      });

      // Inserisci la transfer SPL come prima istruzione
      tx.instructions.unshift(transferIx);
      // Patch minimale: imposta feePayer e recentBlockhash per compatibilità wallet
      tx.feePayer = borrowerPk;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // Log oggetto tx DOPO l'assegnazione
      console.log("[RENT-FLEET] TX oggetto dopo feePayer/recentBlockhash:", tx);
      const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');
      console.log("[RENT-FLEET] TX serializzata (base64):", serialized.slice(0, 80) + '...');
      res.json({ transaction: serialized });
    } catch (err) {
      console.error("[RENT-FLEET] Errore durante la creazione/serializzazione della tx:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

// Parametri principali
const SRSLY_PROGRAM_ID = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");
const connection = new Connection("https://api.mainnet-beta.solana.com");

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
  const provider = new anchor.AnchorProvider(connection, dummyWallet as any, anchor.AnchorProvider.defaultOptions());
  //const program = new anchor.Program(srslyIdl as anchor.Idl, SRSLY_PROGRAM_ID, provider);
  const program = new anchor.Program(srslyIdl as unknown as anchor.Idl, SRSLY_PROGRAM_ID, provider);
  const tx = await program.methods.acceptRental(new BN(amount), new BN(duration)).accounts({
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
  console.log("[acceptRentalTx] TX oggetto:", tx);
  return tx;
}
