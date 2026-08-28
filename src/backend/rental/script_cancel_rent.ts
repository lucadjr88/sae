import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import express from "express";
import { createRequire } from "node:module";

import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { getHealthyRpcUrlOrThrow, getRpcConnection } from "../../utils/rpc/connection.js";
import { prepareTxForWalletSignature } from "../security/txSigningMiddleware.js";

const router = express.Router();

const SRSLY_PROGRAM_ID = new PublicKey("SRSLYxcFnjd5jG2DpJw4as6UEyjwJQK1U4J1TD1hvZH");
const ANTIGEN_PROGRAM_ID = new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1");
const SRSLY_V2_PROGRAM_ID = SRSLY_PROGRAM_ID;
const require = createRequire(import.meta.url);
const srslyV2 = require("@sly-rentals/core/legacy") as typeof import("@sly-rentals/core/legacy");

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

function toPk(value: string | PublicKey): PublicKey {
	return typeof value === "string" ? new PublicKey(value) : value;
}

async function deriveContractPda(fleet: PublicKey): Promise<PublicKey> {
	console.log("[CANCEL-RENT][deriveContractPda] Deriving contract PDA for fleet:", fleet.toBase58());
	const [contractPda] = await PublicKey.findProgramAddress([
		Buffer.from("rental_contract"),
		fleet.toBuffer(),
	], SRSLY_PROGRAM_ID);
	console.log("[CANCEL-RENT][deriveContractPda] Derived contract PDA:", contractPda.toBase58());
	return contractPda;
}

async function deriveRentalAuthorityPda(): Promise<PublicKey> {
	console.log("[CANCEL-RENT][deriveRentalAuthorityPda] Deriving rental authority PDA");
	const [rentalAuthority] = await PublicKey.findProgramAddress([
		Buffer.from("rental_authority"),
	], SRSLY_PROGRAM_ID);
	console.log("[CANCEL-RENT][deriveRentalAuthorityPda] Derived rental authority PDA:", rentalAuthority.toBase58());
	return rentalAuthority;
}

async function deriveRentalStatePda(contract: PublicKey, borrower: PublicKey): Promise<PublicKey> {
	console.log("[CANCEL-RENT][deriveRentalStatePda] Deriving rental state PDA with:", {
		contract: contract.toBase58(),
		borrower: borrower.toBase58(),
	});
	const [rentalState] = await PublicKey.findProgramAddress([
		Buffer.from("rental_state"),
		contract.toBuffer(),
		borrower.toBuffer(),
	], SRSLY_PROGRAM_ID);
	console.log("[CANCEL-RENT][deriveRentalStatePda] Derived rental state PDA:", rentalState.toBase58());
	return rentalState;
}

async function deriveRentalThreadPda(rentalAuthority: PublicKey, rentalState: PublicKey): Promise<PublicKey> {
	console.log("[CANCEL-RENT][deriveRentalThreadPda] Deriving rental thread PDA with:", {
		rentalAuthority: rentalAuthority.toBase58(),
		rentalState: rentalState.toBase58(),
	});
	const [rentalThread] = await PublicKey.findProgramAddress([
		Buffer.from("thread"),
		rentalAuthority.toBuffer(),
		rentalState.toBuffer(),
	], ANTIGEN_PROGRAM_ID);
	console.log("[CANCEL-RENT][deriveRentalThreadPda] Derived rental thread PDA:", rentalThread.toBase58());
	return rentalThread;
}

export async function cancelRentalTx(params: {
	borrower: string | PublicKey;
	contract: string | PublicKey;
	rental_state: string | PublicKey;
	rental_thread: string | PublicKey;
}) {
	const borrower = toPk(params.borrower);
	const contract = toPk(params.contract);
	const rpcUrl = await getHealthyRpcUrlOrThrow();
	srslyV2.setSdkConfig({ programs: "mainnet", rpcUrl, commitment: "confirmed", PublicKey });
	console.log("[cancelRentalTx] Building SRSLY v2 cancelRental instruction", {
		borrower: borrower.toBase58(),
		contract: contract.toBase58(),
	});
	const instructions = await srslyV2.cancelRental({
		borrower: borrower.toBase58(),
		contract: contract.toBase58(),
		cancelDelay: 0,
	}, { rpcUrl, programs: "mainnet", PublicKey });

	const tx = new Transaction();
	tx.add(...instructions.map((instruction) => ({
		...instruction,
		programId: new PublicKey(instruction.programId),
		data: Buffer.from(instruction.data),
		keys: instruction.keys.map((key) => ({
			...key,
			pubkey: new PublicKey(key.pubkey),
		})),
	})));

	const srslyInstructions = tx.instructions.filter((ix) => ix.programId.equals(SRSLY_V2_PROGRAM_ID));
	tx.instructions = srslyInstructions;

	console.log("[cancelRentalTx] Transaction built. Instruction count:", tx.instructions.length);
	console.log("[cancelRentalTx] Instruction data (hex):", tx.instructions[0]?.data?.toString("hex") || "N/A");
	console.log("[cancelRentalTx] TX oggetto:", tx);
	if (tx.instructions.length !== 1) {
		throw new Error(`[cancelRentalTx] Expected 1 SRSLY instruction, found ${tx.instructions.length}`);
	}
	return tx;
}

router.post("/cancel-rent", async (req, res) => {
	try {
		console.log("[CANCEL-RENT] Chiamata ricevuta con body:", req.body);
		const {
			borrower,
			contractAddress,
			rentalStateAddress,
			rentalThreadAddress,
			fleetAddress,
			fleet_id,
			fleetId,
		} = req.body;

		const fleetAddressInput = fleetAddress ?? fleet_id ?? fleetId;
		console.log("[CANCEL-RENT] Normalized request input:", {
			borrower,
			contractAddress,
			rentalStateAddress,
			rentalThreadAddress,
			fleetAddressInput,
		});

		if (!borrower) {
			console.warn("[CANCEL-RENT] Missing borrower in request body");
			res.status(400).json({ error: "Missing required field: borrower" });
			return;
		}

		if (!rentalStateAddress && !contractAddress && !fleetAddressInput) {
			console.warn("[CANCEL-RENT] Missing identifiers to derive cancel rental accounts");
			res.status(400).json({
				error: "Missing required fields: provide rentalStateAddress, or contractAddress, or fleet_id",
			});
			return;
		}

		const borrowerPk = new PublicKey(borrower);
		console.log("[CANCEL-RENT] borrower public key parsed:", borrowerPk.toBase58());
		const contractPk = contractAddress
			? new PublicKey(contractAddress)
			: await deriveContractPda(new PublicKey(fleetAddressInput));
		const rentalAuthorityPk = await deriveRentalAuthorityPda();
		const rentalStatePk = rentalStateAddress
			? new PublicKey(rentalStateAddress)
			: await deriveRentalStatePda(contractPk, borrowerPk);
		const rentalThreadPk = rentalThreadAddress
			? new PublicKey(rentalThreadAddress)
			: await deriveRentalThreadPda(rentalAuthorityPk, rentalStatePk);

		console.log("[CANCEL-RENT] PDAs:", {
			borrower: borrowerPk.toBase58(),
			contract: contractPk.toBase58(),
			rentalAuthority: rentalAuthorityPk.toBase58(),
			rentalState: rentalStatePk.toBase58(),
			rentalThread: rentalThreadPk.toBase58(),
		});
		console.log("[CANCEL-RENT] Calling cancelRentalTx builder");

		const tx = await cancelRentalTx({
			borrower: borrowerPk,
			contract: contractPk,
			rental_state: rentalStatePk,
			rental_thread: rentalThreadPk,
		});

		tx.feePayer = borrowerPk;
		console.log("[CANCEL-RENT] feePayer set:", tx.feePayer?.toBase58?.());
		const connection = await getRpcConnection();
		const latestBlockhash = await connection.getLatestBlockhash();
		tx.recentBlockhash = latestBlockhash.blockhash;
		console.log("[CANCEL-RENT] recentBlockhash set:", latestBlockhash.blockhash);

		const signingPayload = prepareTxForWalletSignature({
			tx,
			signer: borrowerPk,
			operation: 'cancel-rent',
			meta: {
				contract: contractPk.toBase58(),
				rentalState: rentalStatePk.toBase58(),
				rentalThread: rentalThreadPk.toBase58(),
			},
		});
		console.log("[CANCEL-RENT] TX serializzata (base64):", signingPayload.transaction.slice(0, 80) + "...");
		console.log("[CANCEL-RENT][COPY-UNSIGNED-TX-START]");
		console.log(signingPayload.transaction);
		console.log("[CANCEL-RENT][COPY-UNSIGNED-TX-END]");
		console.log("[CANCEL-RENT] Returning unsigned transaction payload to frontend");
		res.json({
			...signingPayload,
			derivedAccounts: {
				contract: contractPk.toBase58(),
				rentalState: rentalStatePk.toBase58(),
				rentalThread: rentalThreadPk.toBase58(),
			},
		});
	} catch (err) {
		console.error("[CANCEL-RENT] Errore durante la creazione/serializzazione della tx:", err);
		if (err instanceof Error && err.stack) {
			console.error("[CANCEL-RENT] Stack:", err.stack);
		}
		res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
	}
});

export default router;
