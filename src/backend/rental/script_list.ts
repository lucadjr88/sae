import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import BN from "bn.js";
import express from "express";
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	createAssociatedTokenAccountInstruction,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import srslyIdl from "../idl/srsly_idl.json" with { type: "json" };
import { getRpcConnection } from "../../utils/rpc/connection.js";
import { deriveWalletAuthority } from "../../utils/deriveWalletAuthority.js";
import { fetchProfileFleets } from "../../utils/fetchProfileFleets.js";
import { getWalletAuthorityUtil } from "../../utils/getWalletAuthority.js";

const router = express.Router();

const SRSLY_PROGRAM_ID = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");
const ATLAS_MINT = new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx");
const GAME_ID = new PublicKey("GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr");
const SAGE_PROGRAM_ID = new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE");
const CREATE_CONTRACT_DISCRIMINATOR = Buffer.from(
	(srslyIdl as any)?.instructions?.find?.((ix: any) => ix?.name === "create_contract" || ix?.name === "createContract")?.discriminator
		?? [244, 48, 244, 178, 216, 88, 122, 52],
);

function pickString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const cleaned = value.trim();
		if (cleaned) return cleaned;
	}
	return undefined;
}

function isPublicKeyString(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		new PublicKey(value);
		return true;
	} catch {
		return false;
	}
}

async function resolveFleetPubkeyFromProfile(profileId: string, fleetRef: string): Promise<string | null> {
	const normalizedRef = fleetRef.trim().toLowerCase();
	if (!normalizedRef) return null;

	console.log("[LIST] resolveFleetPubkeyFromProfile:start", {
		profileId,
		fleetRef,
		normalizedRef,
	});
	const fleets = await fetchProfileFleets(profileId).catch((error) => {
		console.warn("[LIST] resolveFleetPubkeyFromProfile: fetchProfileFleets failed", {
			profileId,
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	});
	const matchedFleet = Array.isArray(fleets)
		? fleets.find((fleet: any) => {
			const candidates = [
				fleet?.key,
				fleet?.pubkey,
				fleet?.fleet,
				fleet?.data?.fleetShips,
				fleet?.callsign,
				fleet?.fleet_label,
				fleet?.fleet_name,
			]
				.map((candidate) => String(candidate ?? "").trim().toLowerCase())
				.filter(Boolean);
			return candidates.includes(normalizedRef);
		})
		: null;

	const resolvedFleet = pickString(
		matchedFleet?.key,
		matchedFleet?.pubkey,
		matchedFleet?.fleet,
		matchedFleet?.data?.fleetShips,
	);
	console.log("[LIST] resolveFleetPubkeyFromProfile:result", {
		profileId,
		fleetRef,
		fleetsCount: Array.isArray(fleets) ? fleets.length : 0,
		matchedCallsign: matchedFleet?.callsign ?? matchedFleet?.fleet_label ?? null,
		resolvedFleet,
	});

	return resolvedFleet && isPublicKeyString(resolvedFleet) ? resolvedFleet : null;
}

async function deriveFleetContextFromChain(fleet: PublicKey): Promise<{ ownerProfile?: string; gameId?: string }> {
	console.log("[LIST] deriveFleetContextFromChain:start", {
		fleet: fleet.toBase58(),
	});
	const connection = await getRpcConnection();
	const fleetInfo = await connection.getAccountInfo(fleet);
	if (!fleetInfo?.data || fleetInfo.data.length < 73) {
		console.warn("[LIST] deriveFleetContextFromChain: account missing or too short", {
			fleet: fleet.toBase58(),
			dataLength: fleetInfo?.data?.length ?? null,
		});
		return {};
	}

	const raw = Buffer.from(fleetInfo.data);
	const derived = {
		gameId: new PublicKey(raw.subarray(9, 41)).toBase58(),
		ownerProfile: new PublicKey(raw.subarray(41, 73)).toBase58(),
	};
	console.log("[LIST] deriveFleetContextFromChain:result", {
		fleet: fleet.toBase58(),
		...derived,
	});
	return derived;
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

function toPk(value: string | PublicKey): PublicKey {
	return typeof value === "string" ? new PublicKey(value) : value;
}

function toU64Bn(value: unknown, label: string, fallback?: number): BN {
	const resolved = value ?? fallback;
	const num = Number(resolved);
	if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
		throw new Error(`Invalid ${label}: expected a non-negative integer`);
	}
	return new BN(num);
}

function normalizePaymentFrequency(value: unknown): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (["@decasecond", "decasecond", "decaseconds"].includes(normalized)) return "@decasecond";
	if (["@minute", "minute", "minutes", "min"].includes(normalized)) return "@minute";
	if (["@hourly", "hourly", "hour", "hours"].includes(normalized)) return "@hourly";
	if (["@weekly", "weekly", "week", "weeks"].includes(normalized)) return "@weekly";
	if (["@monthly", "monthly", "month", "months"].includes(normalized)) return "@monthly";
	return "@daily";
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

async function resolveOwnerKeyIndex(profileId: string, owner: string): Promise<number> {
	try {
		const { allowedWallets } = await getWalletAuthorityUtil(profileId);
		const idx = Array.isArray(allowedWallets)
			? allowedWallets.findIndex((wallet) => wallet?.pubkey === owner)
			: -1;
		const resolved = idx >= 0 ? idx : 0;
		console.log("[LIST] resolveOwnerKeyIndex:result", {
			profileId,
			owner,
			allowedWallets: Array.isArray(allowedWallets) ? allowedWallets.map((wallet) => wallet?.pubkey) : [],
			ownerKeyIndex: resolved,
		});
		return resolved;
	} catch (error) {
		console.warn("[LIST] resolveOwnerKeyIndex:failed", {
			profileId,
			owner,
			error: error instanceof Error ? error.message : String(error),
		});
		return 0;
	}
}

function encodeU64(value: BN): Buffer {
	const out = Buffer.alloc(8);
	out.writeBigUInt64LE(BigInt(value.toString(10)), 0);
	return out;
}

function encodeU16(value: number): Buffer {
	const out = Buffer.alloc(2);
	out.writeUInt16LE(value, 0);
	return out;
}

function encodeBorshString(value: string): Buffer {
	const content = Buffer.from(value, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32LE(content.length, 0);
	return Buffer.concat([length, content]);
}

function encodeCreateContractInstructionData(params: {
	rate: BN;
	durationMin: BN;
	durationMax: BN;
	paymentFrequency: string;
	ownerKeyIndex: number;
}): Buffer {
	return Buffer.concat([
		CREATE_CONTRACT_DISCRIMINATOR,
		encodeU64(params.rate),
		encodeU64(params.durationMin),
		encodeU64(params.durationMax),
		encodeBorshString(params.paymentFrequency),
		encodeU16(params.ownerKeyIndex),
	]);
}

async function buildListFleetTx(params: {
	owner: string | PublicKey;
	ownerProfile: string | PublicKey;
	fleet: string | PublicKey;
	rate: number | string;
	durationMin?: number | string;
	durationMax?: number | string;
	paymentFrequency?: string;
	ownerKeyIndex?: number | string;
	gameId?: string | PublicKey | null;
}) {
	const connection = await getRpcConnection();

	const owner = toPk(params.owner);
	const ownerProfile = toPk(params.ownerProfile);
	const fleet = toPk(params.fleet);
	const gameId = params.gameId ? toPk(params.gameId) : GAME_ID;
	// SRSLY `rate` is charged per raw `paymentFrequency` unit; do not auto-convert here.
	const rate = toU64Bn(params.rate, "rate");
	const durationMin = toU64Bn(params.durationMin, "durationMin", 1);
	const durationMax = toU64Bn(params.durationMax, "durationMax", 24);
	const paymentFrequency = normalizePaymentFrequency(params.paymentFrequency);
	const ownerKeyIndex = Number(params.ownerKeyIndex ?? 0);

	if (!Number.isInteger(ownerKeyIndex) || ownerKeyIndex < 0 || ownerKeyIndex > 65535) {
		throw new Error("Invalid ownerKeyIndex: expected an integer between 0 and 65535");
	}
	if (durationMin.gt(durationMax)) {
		throw new Error("durationMin cannot be greater than durationMax");
	}

	const contract = await deriveContractPda(fleet);
	const rentalAuthority = await deriveRentalAuthorityPda();
	const ownerTokenAccount = await getAssociatedTokenAddress(
		ATLAS_MINT,
		owner,
		false,
		TOKEN_PROGRAM_ID,
		ASSOCIATED_TOKEN_PROGRAM_ID,
	);

	console.log("[LIST] Building createContract tx:", {
		owner: owner.toBase58(),
		ownerProfile: ownerProfile.toBase58(),
		fleet: fleet.toBase58(),
		gameId: gameId.toBase58(),
		contract: contract.toBase58(),
		rentalAuthority: rentalAuthority.toBase58(),
		rate: rate.toString(),
		durationMin: durationMin.toString(),
		durationMax: durationMax.toString(),
		paymentFrequency,
		ownerKeyIndex,
	});

	const instructionData = encodeCreateContractInstructionData({
		rate,
		durationMin,
		durationMax,
		paymentFrequency,
		ownerKeyIndex,
	});
	console.log("[LIST] createContract ix payload", {
		dataHex: instructionData.toString("hex"),
		dataBase64: instructionData.toString("base64"),
		paymentFrequency,
		ownerKeyIndex,
	});

	const createIx = new TransactionInstruction({
		programId: SRSLY_PROGRAM_ID,
		keys: [
			{ pubkey: ATLAS_MINT, isSigner: false, isWritable: false },
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
			{ pubkey: fleet, isSigner: false, isWritable: true },
			{ pubkey: ownerProfile, isSigner: false, isWritable: false },
			{ pubkey: gameId, isSigner: false, isWritable: false },
			{ pubkey: contract, isSigner: false, isWritable: true },
			{ pubkey: rentalAuthority, isSigner: false, isWritable: false },
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
			{ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
			{ pubkey: SAGE_PROGRAM_ID, isSigner: false, isWritable: false },
		],
		data: instructionData,
	});
	console.log("[LIST] createContract ix keys", createIx.keys.map((key, index) => ({
		index,
		pubkey: key.pubkey.toBase58(),
		isSigner: key.isSigner,
		isWritable: key.isWritable,
	})));

	const tx = new Transaction();
	const ownerAtaInfo = await connection.getAccountInfo(ownerTokenAccount);
	if (!ownerAtaInfo) {
		console.log("[LIST] owner ATA missing, adding create ATA pre-instruction:", ownerTokenAccount.toBase58());
		tx.add(createAssociatedTokenAccountInstruction(
			owner,
			ownerTokenAccount,
			owner,
			ATLAS_MINT,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID,
		));
	}
	tx.add(createIx);

	return {
		tx,
		derivedAccounts: {
			owner: owner.toBase58(),
			ownerProfile: ownerProfile.toBase58(),
			fleet: fleet.toBase58(),
			gameId: gameId.toBase58(),
			contract: contract.toBase58(),
			rentalAuthority: rentalAuthority.toBase58(),
			ownerTokenAccount: ownerTokenAccount.toBase58(),
		},
		normalizedArgs: {
			rate: rate.toString(),
			durationMin: durationMin.toString(),
			durationMax: durationMax.toString(),
			paymentFrequency,
			ownerKeyIndex,
		},
	};
}

async function handleListFleet(req: express.Request, res: express.Response) {
	try {
		console.log("[LIST] Chiamata ricevuta con body:", req.body);
		const {
			owner,
			ownerProfile,
			owner_profile,
			profileId,
			profile_id,
			fleetAddress,
			fleet_id,
			fleetId,
			fleetName,
			fleet_name,
			selectedFleet,
			rate,
			durationMin,
			duration_min,
			durationMax,
			duration_max,
			paymentFrequency,
			payment_frequency,
			ownerKeyIndex,
			owner_key_index,
			gameId,
			game_id,
		} = req.body ?? {};

		let ownerInput = pickString(owner);
		let ownerProfileInput = pickString(ownerProfile, owner_profile, profileId, profile_id);
		let fleetInput = pickString(fleetAddress, fleet_id, fleetId, fleetName, fleet_name, selectedFleet);
		const gameIdInputRaw = pickString(gameId, game_id);
		console.log("[LIST] Normalized incoming refs:", {
			ownerInput,
			ownerProfileInput,
			fleetInput,
			rate,
			durationMin: durationMin ?? duration_min,
			durationMax: durationMax ?? duration_max,
			paymentFrequency: paymentFrequency ?? payment_frequency,
			ownerKeyIndex: ownerKeyIndex ?? owner_key_index,
			gameIdInput: gameIdInputRaw,
		});

		if (!fleetInput) {
			res.status(400).json({
				error: "Missing required field: fleetAddress/fleet_id/fleetName",
			});
			return;
		}

		if (rate == null || String(rate).trim() === "") {
			res.status(400).json({ error: "Missing required field: rate" });
			return;
		}

		if (ownerProfileInput) {
			const resolvedFleet = await resolveFleetPubkeyFromProfile(ownerProfileInput, fleetInput);
			if (resolvedFleet) {
				fleetInput = resolvedFleet;
			}
		}

		if (!isPublicKeyString(fleetInput)) {
			if (!ownerProfileInput) {
				res.status(400).json({
					error: "Cannot resolve fleet name without ownerProfile/profileId",
				});
				return;
			}
			const resolvedFleet = await resolveFleetPubkeyFromProfile(ownerProfileInput, fleetInput);
			if (!resolvedFleet) {
				res.status(404).json({
					error: `Unable to resolve fleet reference: ${fleetInput}`,
				});
				return;
			}
			fleetInput = resolvedFleet;
		}

		const fleetPk = new PublicKey(fleetInput);
		const chainContext = await deriveFleetContextFromChain(fleetPk);
		ownerProfileInput = ownerProfileInput ?? chainContext.ownerProfile;
		const gameIdInput = gameIdInputRaw ?? chainContext.gameId;

		if (!ownerProfileInput) {
			res.status(400).json({
				error: "Unable to derive ownerProfile for the selected fleet",
			});
			return;
		}

		if (!ownerInput) {
			console.log("[LIST] Owner not provided, deriving wallet authority from profile", {
				ownerProfileInput,
			});
			ownerInput = await deriveWalletAuthority([], ownerProfileInput) ?? undefined;
			console.log("[LIST] Derived wallet authority result", {
				ownerProfileInput,
				ownerInput,
			});
		}

		if (!ownerInput) {
			res.status(400).json({
				error: `Unable to derive owner wallet for profile ${ownerProfileInput}`,
			});
			return;
		}

		console.log("[LIST] Resolved request context:", {
			owner: ownerInput,
			ownerProfile: ownerProfileInput,
			fleet: fleetInput,
			gameId: gameIdInput,
		});

		const resolvedOwnerKeyIndex = ownerKeyIndex != null
			? Number(ownerKeyIndex)
			: owner_key_index != null
				? Number(owner_key_index)
				: await resolveOwnerKeyIndex(ownerProfileInput, ownerInput);

		const ownerPk = new PublicKey(ownerInput);
		const { tx, derivedAccounts, normalizedArgs } = await buildListFleetTx({
			owner: ownerPk,
			ownerProfile: new PublicKey(ownerProfileInput),
			fleet: fleetPk,
			rate,
			durationMin: durationMin ?? duration_min,
			durationMax: durationMax ?? duration_max,
			paymentFrequency: paymentFrequency ?? payment_frequency,
			ownerKeyIndex: resolvedOwnerKeyIndex,
			gameId: gameIdInput ? new PublicKey(gameIdInput) : null,
		});

		tx.feePayer = ownerPk;
		const connection = await getRpcConnection();
		const latestBlockhash = await connection.getLatestBlockhash();
		tx.recentBlockhash = latestBlockhash.blockhash;

		const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");
		console.log("[LIST] TX serializzata (base64):", serialized.slice(0, 80) + "...");
		console.log("[LIST][COPY-UNSIGNED-TX-START]");
		console.log(serialized);
		console.log("[LIST][COPY-UNSIGNED-TX-END]");

		res.json({
			transaction: serialized,
			derivedAccounts,
			normalizedArgs,
		});
	} catch (err) {
		console.error("[LIST] Errore durante la creazione/serializzazione della tx:", err);
		if (err instanceof Error && err.stack) {
			console.error("[LIST] Stack:", err.stack);
		}
		res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
	}
}

export { buildListFleetTx };

router.post("/list-fleet", handleListFleet);
router.post("/create-contract", handleListFleet);

export default router;
