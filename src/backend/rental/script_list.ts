import { PublicKey } from "@solana/web3.js";
import express from "express";

import { getRpcConnection } from "../../utils/rpc/connection.js";
import { deriveWalletAuthority } from "../../utils/deriveWalletAuthority.js";
import { prepareTxForWalletSignature } from "../security/txSigningMiddleware.js";
import { fetchProfileFleets } from "../../utils/fetchProfileFleets.js";
import { getWalletAuthorityUtil } from "../../utils/getWalletAuthority.js";
import { buildListFleetTx } from "./buildListFleetTx.js";

const router = express.Router();

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
	try {
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
	} catch (error) {
		console.warn("[LIST] deriveFleetContextFromChain: getAccountInfo failed", {
			fleet: fleet.toBase58(),
			error: error instanceof Error ? error.message : String(error),
		});
		return {};
	}
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
			rpcProfileId: pickString(profileId, ownerProfileInput),
		});

		tx.feePayer = ownerPk;
		const connection = await getRpcConnection();
		const latestBlockhash = await connection.getLatestBlockhash();
		tx.recentBlockhash = latestBlockhash.blockhash;

		const signingPayload = prepareTxForWalletSignature({
			tx,
			signer: ownerPk,
			operation: 'list-fleet',
			profileId: pickString(profileId, ownerProfileInput),
			meta: {
				contract: derivedAccounts.contract ?? null,
				fleet: fleetPk.toBase58(),
			},
		});
		console.log("[LIST] TX serializzata (base64):", signingPayload.transaction.slice(0, 80) + "...");
		console.log("[LIST][COPY-UNSIGNED-TX-START]");
		console.log(signingPayload.transaction);
		console.log("[LIST][COPY-UNSIGNED-TX-END]");

		res.json({
			...signingPayload,
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
