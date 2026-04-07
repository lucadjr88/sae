import { PublicKey, Transaction } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import express from "express";
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	createAssociatedTokenAccountInstruction,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { getRpcConnection } from "../../utils/rpc/connection.js";

const router = express.Router();

const SRSLY_PROGRAM_ID = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");
const SAGE_PROGRAM_ID = new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE");
const ATLAS_MINT = new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx");

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

function toOptionalPk(value: unknown): PublicKey | null {
	if (!value) return null;
	try {
		const pk = value instanceof PublicKey ? value : new PublicKey(String(value));
		return pk.equals(PublicKey.default) ? null : pk;
	} catch {
		return null;
	}
}

function pickField(source: any, ...names: string[]): unknown {
	for (const name of names) {
		if (source && source[name] != null) {
			return source[name];
		}
	}
	return null;
}

async function deriveContractPda(fleet: PublicKey): Promise<PublicKey> {
	const [contractPda] = await PublicKey.findProgramAddress([
		Buffer.from("rental_contract"),
		fleet.toBuffer(),
	], SRSLY_PROGRAM_ID);
	return contractPda;
}

async function deriveRentalAuthorityPda(): Promise<PublicKey> {
	const [rentalAuthority] = await PublicKey.findProgramAddress([
		Buffer.from("rental_authority"),
	], SRSLY_PROGRAM_ID);
	return rentalAuthority;
}

async function buildDelistFleetTx(params: {
	owner: string | PublicKey;
	fleet?: string | PublicKey;
	contract?: string | PublicKey;
	gameId?: string | PublicKey | null;
	rentalState?: string | PublicKey | null;
	borrower?: string | PublicKey | null;
}) {
	const dummyWallet = {
		publicKey: PublicKey.default,
		signTransaction: async (tx: any) => tx,
		signAllTransactions: async (txs: any) => txs,
	};

	const connection = await getRpcConnection();
	const provider = new anchor.AnchorProvider(connection, dummyWallet as any, anchor.AnchorProvider.defaultOptions());
	const program = new anchor.Program(srslyLegacyIdl, SRSLY_PROGRAM_ID, provider);

	const owner = toPk(params.owner);
	const fleetInput = params.fleet ? toPk(params.fleet) : null;
	const contract = params.contract
		? toPk(params.contract)
		: fleetInput
			? await deriveContractPda(fleetInput)
			: null;

	if (!contract) {
		throw new Error("Missing contract or fleet to derive the rental contract PDA");
	}

	const rentalAuthority = await deriveRentalAuthorityPda();
	const contractStateAccount = await (program.account as any).contractState.fetch(contract);
	const fleet = fleetInput ?? toOptionalPk(pickField(contractStateAccount, "fleet"));
	if (!fleet) {
		throw new Error(`Unable to resolve fleet for contract ${contract.toBase58()}`);
	}

	const contractOwner = toOptionalPk(pickField(contractStateAccount, "owner"));
	if (contractOwner && !contractOwner.equals(owner)) {
		throw new Error(`Owner mismatch: request=${owner.toBase58()} contract=${contractOwner.toBase58()}`);
	}

	const currentRentalState = toOptionalPk(params.rentalState)
		?? toOptionalPk(pickField(contractStateAccount, "currentRentalState", "current_rental_state"));
	const gameId = toOptionalPk(params.gameId)
		?? toOptionalPk(pickField(contractStateAccount, "gameId", "game_id"));

	let borrower = toOptionalPk(params.borrower);
	let ownerTokenAccount: PublicKey | null = null;
	let rentalTokenAccount: PublicKey | null = null;
	let borrowerTokenAccount: PublicKey | null = null;
	const hasActiveRental = Boolean(currentRentalState);

	if (hasActiveRental && currentRentalState) {
		const rentalStateAccount = await (program.account as any).rentalState.fetch(currentRentalState);
		borrower = borrower ?? toOptionalPk(pickField(rentalStateAccount, "borrower"));
		if (!borrower) {
			throw new Error(`Unable to resolve borrower for rental state ${currentRentalState.toBase58()}`);
		}

		ownerTokenAccount = await getAssociatedTokenAddress(
			ATLAS_MINT,
			owner,
			false,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID,
		);
		rentalTokenAccount = await getAssociatedTokenAddress(
			ATLAS_MINT,
			currentRentalState,
			true,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID,
		);
		borrowerTokenAccount = await getAssociatedTokenAddress(
			ATLAS_MINT,
			borrower,
			false,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID,
		);
	}

	const closeAccounts = {
		owner,
		owner_token_account: ownerTokenAccount,
		rental_token_account: rentalTokenAccount,
		borrower_token_account: borrowerTokenAccount,
		rental_state: currentRentalState,
		fleet,
		game_id: gameId,
		starbase: null,
		starbase_player: null,
		contract,
		rental_authority: rentalAuthority,
		sage_program: SAGE_PROGRAM_ID,
		token_program: hasActiveRental ? TOKEN_PROGRAM_ID : null,
	};

	console.log("[DELIST] Building closeContract tx with accounts:", {
		owner: owner.toBase58(),
		fleet: fleet.toBase58(),
		contract: contract.toBase58(),
		rentalAuthority: rentalAuthority.toBase58(),
		gameId: gameId?.toBase58?.() ?? null,
		rentalState: currentRentalState?.toBase58?.() ?? null,
		borrower: borrower?.toBase58?.() ?? null,
		hasActiveRental,
	});

	const closeIx = await program.methods.closeContract().accountsStrict(closeAccounts as any).instruction();
	const tx = new Transaction();

	if (ownerTokenAccount && hasActiveRental) {
		const ownerAtaInfo = await connection.getAccountInfo(ownerTokenAccount);
		if (!ownerAtaInfo) {
			console.log("[DELIST] owner ATA missing, adding create ATA pre-instruction:", ownerTokenAccount.toBase58());
			tx.add(createAssociatedTokenAccountInstruction(
				owner,
				ownerTokenAccount,
				owner,
				ATLAS_MINT,
				TOKEN_PROGRAM_ID,
				ASSOCIATED_TOKEN_PROGRAM_ID,
			));
		}
	}

	tx.add(closeIx);

	return {
		tx,
		derivedAccounts: {
			fleet: fleet.toBase58(),
			contract: contract.toBase58(),
			rentalAuthority: rentalAuthority.toBase58(),
			gameId: gameId?.toBase58?.() ?? null,
			rentalState: currentRentalState?.toBase58?.() ?? null,
			borrower: borrower?.toBase58?.() ?? null,
			ownerTokenAccount: ownerTokenAccount?.toBase58?.() ?? null,
			rentalTokenAccount: rentalTokenAccount?.toBase58?.() ?? null,
			borrowerTokenAccount: borrowerTokenAccount?.toBase58?.() ?? null,
			hasActiveRental,
		},
	};
}

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

		const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");
		console.log("[DELIST] TX serializzata (base64):", serialized.slice(0, 80) + "...");
		console.log("[DELIST][COPY-UNSIGNED-TX-START]");
		console.log(serialized);
		console.log("[DELIST][COPY-UNSIGNED-TX-END]");

		res.json({
			transaction: serialized,
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
