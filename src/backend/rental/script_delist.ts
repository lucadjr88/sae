import { PublicKey } from "@solana/web3.js";
import express from "express";
import { getRpcConnection } from "../../utils/rpc/connection.js";
import { prepareTxForWalletSignature } from "../security/txSigningMiddleware.js";
import { buildDelistFleetTx } from "./buildDelistFleetTx.js";

const router = express.Router();

async function handleDelistFleet(req: express.Request, res: express.Response) {
	try {
		console.log("[DELIST] Chiamata ricevuta con body:", req.body);
		const {
			owner,
			fleetAddress,
			fleet_id,
			fleetId,
			contractAddress,
			gameId,
			game_id,
			rentalStateAddress,
			borrower,
		} = req.body ?? {};

		const fleetInput = fleetAddress ?? fleet_id ?? fleetId;
		const gameIdInput = gameId ?? game_id ?? null;

		if (!owner) {
			res.status(400).json({ error: "Missing required field: owner" });
			return;
		}

		if (!contractAddress && !fleetInput) {
			res.status(400).json({
				error: "Missing required fields: provide contractAddress or fleetAddress/fleet_id",
			});
			return;
		}

		const ownerPk = new PublicKey(owner);
		const { tx, derivedAccounts } = await buildDelistFleetTx({
			owner: ownerPk,
			fleet: fleetInput ? new PublicKey(fleetInput) : undefined,
			contract: contractAddress ? new PublicKey(contractAddress) : undefined,
			gameId: gameIdInput ? new PublicKey(gameIdInput) : null,
			rentalState: rentalStateAddress ? new PublicKey(rentalStateAddress) : null,
			borrower: borrower ? new PublicKey(borrower) : null,
		});

		tx.feePayer = ownerPk;
		const connection = await getRpcConnection();
		const latestBlockhash = await connection.getLatestBlockhash();
		tx.recentBlockhash = latestBlockhash.blockhash;

		const signingPayload = prepareTxForWalletSignature({
			tx,
			signer: ownerPk,
			operation: 'delist-fleet',
			meta: {
				contract: derivedAccounts.contract ?? null,
				rentalState: derivedAccounts.rentalState ?? null,
				fleet: derivedAccounts.fleet ?? fleetInput ?? null,
			},
		});
		console.log("[DELIST] TX serializzata (base64):", signingPayload.transaction.slice(0, 80) + "...");
		console.log("[DELIST][COPY-UNSIGNED-TX-START]");
		console.log(signingPayload.transaction);
		console.log("[DELIST][COPY-UNSIGNED-TX-END]");

		res.json({
			...signingPayload,
			derivedAccounts,
		});
	} catch (err) {
		console.error("[DELIST] Errore durante la creazione/serializzazione della tx:", err);
		if (err instanceof Error && err.stack) {
			console.error("[DELIST] Stack:", err.stack);
		}
		res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
	}
}

export { buildDelistFleetTx };

router.post("/delist-fleet", handleDelistFleet);
router.post("/close-contract", handleDelistFleet);

export default router;
