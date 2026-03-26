import { Connection, PublicKey, Keypair, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

// PATCH: Express endpoint minimale per orchestrare la rental tx
import express from "express";
import fs from "fs";
const router = express.Router();

// Carica contracts.json una sola volta (in produzione meglio usare cache o fetch dinamico)
const contractsCache = JSON.parse(fs.readFileSync("cache/contracts.json", "utf8"));

router.post("/rent-fleet", async (req, res) => {
  try {
    console.log("[RENT-FLEET] Chiamata ricevuta con body:", req.body);
    const {
      contractAddress,
      borrowerProfile,
      borrowerProfileFaction,
      starbase,
      amount,
      duration
    } = req.body;

    const contract = contractsCache.find((c: any) => c.address === contractAddress);
    if (!contract) {
      console.error("[RENT-FLEET] Contratto non trovato per address:", contractAddress);
      return res.status(404).json({ error: "Contract not found" });
    }
    console.log("[RENT-FLEET] Contratto trovato:", contract);

    try {
      const tx = await acceptRentalTx({
        contract,
        borrowerProfile,
        borrowerProfileFaction,
        starbase,
        amount,
        duration
      });
      const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

      // DEBUG: deserializza e stampa a log la tx
      try {
        const { Transaction } = require("@solana/web3.js");
        const deserializedTx = Transaction.from(Buffer.from(serialized, 'base64'));
        console.log("[DEBUG] TX deserializzata:", deserializedTx);
      } catch (e) {
        console.error("[DEBUG] Errore deserializzazione tx:", e);
      }

      res.json({ transaction: serialized });
    } catch (err) {
      console.error("[RENT-FLEET] Errore durante la creazione/serializzazione della tx:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  } catch (e) {
    console.error("[RENT-FLEET] Errore generico:", e);
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
export async function acceptRentalTx({ contract, borrowerProfile, borrowerProfileFaction, starbase, amount, duration }: any) {
  const ATLAS_MINT = new PublicKey("ATLASX6Ds5Z5iFv7Qq5tFQw1kQnX2U1QnX2U1QnX2U1Q");
  // borrower = chi firmerà la tx (dal frontend)
  const borrower = new PublicKey(borrowerProfile);
  const fleet = new PublicKey(contract.fleet);
  const gameId = new PublicKey(contract.game_id);
  const owner = new PublicKey(contract.owner);
  const ownerProfile = new PublicKey(contract.owner_profile);
  const rentalState = new PublicKey(contract.current_rental_state);
  const rentalTokenAccount = new PublicKey(contract.owner_token_account);
  const contractAddress = new PublicKey(contract.address);
  const starbasePubkey = new PublicKey(contract.starbase_pubkey || starbase);

  const borrowerTokenAccount = await getAssociatedTokenAddress(
    ATLAS_MINT,
    borrower,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const [starbasePlayer] = await PublicKey.findProgramAddress(
    [Buffer.from("starbase_player"), borrower.toBuffer(), starbasePubkey.toBuffer()],
    SRSLY_PROGRAM_ID
  );

  const [rentalAuthority] = await PublicKey.findProgramAddress(
    [Buffer.from("authority"), contractAddress.toBuffer()],
    SRSLY_PROGRAM_ID
  );

  // rentalThread non usato qui

  const feeTokenAccount = rentalTokenAccount;
  const sageProgram = new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE");
  const antegenProgram = new PublicKey("ANTEGEN111111111111111111111111111111111111");
  const tokenProgram = TOKEN_PROGRAM_ID;
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID;
  const systemProgram = SystemProgram.programId;

  const ix = new TransactionInstruction({
    programId: SRSLY_PROGRAM_ID,
    keys: [
      { pubkey: ATLAS_MINT, isSigner: false, isWritable: false },
      { pubkey: borrower, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(borrowerProfile), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(borrowerProfileFaction), isSigner: false, isWritable: false },
      { pubkey: borrowerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: fleet, isSigner: false, isWritable: false },
      { pubkey: gameId, isSigner: false, isWritable: false },
      { pubkey: starbasePubkey, isSigner: false, isWritable: false },
      { pubkey: starbasePlayer, isSigner: false, isWritable: false },
      { pubkey: contractAddress, isSigner: false, isWritable: false },
      { pubkey: rentalState, isSigner: false, isWritable: true },
      { pubkey: rentalAuthority, isSigner: false, isWritable: false },
      { pubkey: rentalTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: sageProgram, isSigner: false, isWritable: false },
      { pubkey: antegenProgram, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: associatedTokenProgram, isSigner: false, isWritable: false },
      { pubkey: systemProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([192, 221, 241, 212, 141, 161, 36, 146]),
      new BN(amount).toArrayLike(Buffer, "le", 8),
      new BN(duration).toArrayLike(Buffer, "le", 8),
    ]),
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = borrower;
  // Non firmare qui!
  return tx;
}
