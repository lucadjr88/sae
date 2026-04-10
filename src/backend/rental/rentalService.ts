import {
	CONTRACT_DISCRIMINATOR,
	decodeContractState,
	decodeFleetMeta,
	decodeFleetShipsEntries,
	decodeRentalState,
	decodeShipName,
	decodeFuel,
	decodeCargo,
	decodeAmmo,
	decodeCrew,
} from './decode.js';
// Decodifica fedele a Rust/Borsh della struct Fleet per estrarre FleetState e settori
// Aggiunge log di debug per ogni stato
import * as fs from 'fs/promises';
import * as path from 'path';
import bs58 from 'bs58';
import { PublicKey, type AccountInfo, type Connection } from '@solana/web3.js';

import { RpcPoolManager } from '../../utils/rpc/rpc-pool-manager.js';
import type { ContractQueryOptions, FleetStarbase, RentalContract } from './types.js';
// ...existing code...
// ...existing code...

interface CacheEntry<T> { at: number; items: T[] }
interface FleetCacheEntry { fleet_name?: string; fleet_composition?: string; fleet_ships?: string; starbase?: FleetStarbase; faction?: number }

type MaybeAccount = AccountInfo<Buffer> | null;

let MAX_LIMIT = 10000;
const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
const CACHE_TTL_MS = 30_000;
const RPC_CALL_TIMEOUT_MS = 12_000;

function chunk<T>(input: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < input.length; i += size) out.push(input.slice(i, i + size));
	return out;
}
function clampLimit(limit: number | undefined): number | undefined {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return undefined;
	return Math.min(Math.floor(limit), MAX_LIMIT);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeRpcError(error: unknown): string {
	const name = typeof (error as { name?: unknown })?.name === 'string'
		? String((error as { name?: string }).name)
		: 'Error';
	const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
	const rpcCode = typeof (error as { value?: { error?: { code?: unknown } } })?.value?.error?.code === 'number'
		? Number((error as { value?: { error?: { code?: number } } }).value?.error?.code)
		: undefined;
	const rpcMessage = typeof (error as { value?: { error?: { message?: unknown } } })?.value?.error?.message === 'string'
		? String((error as { value?: { error?: { message?: string } } }).value?.error?.message)
		: '';
	const compactMessage = message.split('\n')[0]?.trim() || message;

	if (rpcCode !== undefined) {
		return `${name}: rpcCode=${rpcCode}${rpcMessage ? ` ${rpcMessage}` : ''}`;
	}
	return `${name}: ${compactMessage}`;
}

function getRpcErrorType(error: unknown): '429' | '503' | 'error' {
	const status = typeof (error as { status?: unknown })?.status === 'number'
		? Number((error as { status?: number }).status)
		: undefined;
	const message = error instanceof Error ? error.message : String(error ?? '');
	const rpcCode = typeof (error as { value?: { error?: { code?: unknown } } })?.value?.error?.code === 'number'
		? Number((error as { value?: { error?: { code?: number } } }).value?.error?.code)
		: undefined;
	const rpcMessage = typeof (error as { value?: { error?: { message?: unknown } } })?.value?.error?.message === 'string'
		? String((error as { value?: { error?: { message?: string } } }).value?.error?.message)
		: '';
	const haystack = `${message} ${rpcMessage}`;

	if (status === 429 || /429|Too Many Requests/i.test(haystack)) return '429';
	if (
		status === 408 ||
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504 ||
		rpcCode === -32603 ||
		/500|502|503|504|Service Unavailable|Internal JSON-RPC error|StructError|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|socket hang up/i.test(haystack)
	) {
		return '503';
	}
	return 'error';
}

function getRpcRetryDelayMs(errorType: '429' | '503' | 'error', attempt: number): number {
	if (errorType === '429') {
		const base = Math.min(4_000, 400 * Math.pow(2, Math.max(0, attempt - 1)));
		return base + Math.floor(Math.random() * 250);
	}
	if (errorType === '503') {
		return 150 + Math.floor(Math.random() * 200);
	}
	return 50;
}

async function withRpcTimeout<T>(operation: Promise<T>, label: string, timeoutMs = RPC_CALL_TIMEOUT_MS): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => {
					const error = new Error(`RPC timeout after ${timeoutMs}ms (${label})`) as Error & { status?: number };
					error.name = 'RpcTimeoutError';
					error.status = 504;
					reject(error);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export class RentalService {
		// Recupera i rental contracts da blockchain (prima chiamata RPC)
		public async fetchContractsOnChain(profileId: string, limit?: number): Promise<RentalContract[]> {
			const accounts = await this.executeRpc(profileId, (connection) =>
				connection.getProgramAccounts(this.programId, {
					filters: [{ memcmp: { offset: 0, bytes: bs58.encode(CONTRACT_DISCRIMINATOR) } }],
					commitment: 'confirmed',
				}),
			);

			const contracts: RentalContract[] = [];
			// Prepara lista di fleet addresses da decodificare dopo
			const fleetAddresses: string[] = [];
			for (const { pubkey, account } of accounts) {
				const decoded = decodeContractState(account.data);
				if (!decoded || decoded.to_close) continue;
				contracts.push({
					address: pubkey.toBase58(),
					owner: decoded.owner,
					owner_profile: decoded.owner_profile,
					fleet: decoded.fleet,
					game_id: decoded.game_id,
					rate: decoded.rate,
					duration_min: decoded.duration_min,
					duration_max: decoded.duration_max,
					payment_frequency: decoded.payment_frequency,
					to_close: decoded.to_close,
					current_rental_state: decoded.current_rental_state,
					owner_token_account: decoded.owner_token_account,
				});
				fleetAddresses.push(decoded.fleet);
				if (limit !== undefined && contracts.length >= limit) break;
			}


				await this.populateFleetMetadata(contracts, profileId);
				// Decodifica dettagli fleet (crew, cargo, fuel, ammo, stats)
				// Recupera accounts delle fleet
				const fleetAccounts = await this.fetchAccountsByAddresses(fleetAddresses, profileId);
				for (let i = 0; i < contracts.length; i++) {
					const contract = contracts[i];
					const fleetAccount = fleetAccounts.get(contract.fleet);
					if (!fleetAccount) continue;
					const data = fleetAccount.data;
					try {
						// Offsets basati sulla struct Rust ufficiale Fleet
						const readU16 = (buf: Buffer, off: number) => buf.readUInt16LE(off);
						const readU32 = (buf: Buffer, off: number) => buf.readUInt32LE(off);
						const readPubkey = (buf: Buffer, off: number) => new PublicKey(buf.subarray(off, off + 32)).toBase58();
						let off = 8; // skip discriminator
						// ... (omitted: see backup for full field extraction if needed)
						// You can add more detailed decoding here as needed
					} catch (e) {
						// ignora errori di parsing
					}
				}
			
			return contracts;
		}
	private contractsCache: CacheEntry<RentalContract> | null = null;
	private readonly fleetMetaCache = new Map<string, FleetCacheEntry>();
	private readonly shipNameCache = new Map<string, string>();
	private async readContracts(profileId: string, limit?: number): Promise<{ contracts: RentalContract[], createdAt?: string }> {
		const fsPath = path.join(process.cwd(), 'cache', 'contracts.json');
		let contracts: RentalContract[] = [];
		let createdAt: string | undefined = undefined;
		let fromCache = false;
		try {
			const raw = await fs.readFile(fsPath, 'utf8');
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				contracts = parsed;
			} else if (parsed && Array.isArray(parsed.contracts)) {
				contracts = parsed.contracts;
				createdAt = parsed.createdAt;
				fromCache = true;
			}
		} catch {
			// fallback: nessun file o errore di parsing
		}
		if (!contracts.length) {
			contracts = await this.fetchContractsOnChain(profileId, limit);
			// Solo ora aggiorna il file e la data
			await this.saveContractsToCache(profileId, contracts);
			createdAt = new Date().toISOString();
		}
		const filtered = limit !== undefined ? contracts.slice(0, limit) : contracts;
		return { contracts: filtered, createdAt };
	}
	constructor(
		private readonly programId: PublicKey,
		private readonly cacheTtlMs: number,
	) {}

	async getContracts(options: ContractQueryOptions = {}): Promise<{ contracts: RentalContract[], createdAt?: string }> {
		const profileId = this.resolveProfileId(options.profileId);
		const { contracts, createdAt } = await this.readContracts(profileId, options.limit);
		// fetch opzionali

		// Nuova fetch moduli secondari (fuel, cargo, ammo, crew, ecc.)
		if (options.includeModules) {
			// Estrai tutte le fleet decodificate (solo quelle con fleet_name o fleet_ships)
			const fleets: any[] = contracts.map((c) => ({
				fuel_tank: c.fuel_tank,
				cargo_hold: c.cargo_hold,
				ammo_bank: c.ammo_bank,
				crew: c.crew,
			}));
			// ...existing code...
		}

		// NON aggiornare la cache qui: la aggiorni solo se la rigeneri
		const filtered = this.applyFilters(contracts, options);
		return { contracts: filtered, createdAt };
	}
	// Recupera account multipli tramite getMultipleAccountsInfo (batch RPC)
	public async fetchAccountsByAddresses(
		addresses: string[],
		profileId: string,
	): Promise<Map<string, MaybeAccount>> {
		const out = new Map<string, MaybeAccount>();
		for (const currentChunk of chunk(addresses, 100)) {
			await this.fetchAccountsChunk(currentChunk, profileId, out);
		}
		return out;
	}

	private async fetchAccountsChunk(
		addresses: string[],
		profileId: string,
		out: Map<string, MaybeAccount>,
	): Promise<void> {
		const pubkeys: PublicKey[] = [];
		const validAddresses: string[] = [];
		for (const address of addresses) {
			try {
				pubkeys.push(new PublicKey(address));
				validAddresses.push(address);
			} catch {
				out.set(address, null);
			}
		}
		if (pubkeys.length === 0) return;

		try {
			const results = await this.executeRpc(profileId, (connection) =>
				withRpcTimeout(
					connection.getMultipleAccountsInfo(pubkeys, 'confirmed'),
					`getMultipleAccountsInfo(${pubkeys.length})`,
				),
			);
			console.log(`[rentalService] Fetched ${results.length} accounts for chunk.`);
			results.forEach((account, index) => {
				const address = validAddresses[index];
				if (!address) return;
				out.set(address, account);
			});
		} catch (err) {
			if (validAddresses.length > 1) {
				const nextChunkSize = Math.max(1, Math.floor(validAddresses.length / 2));
				console.warn(
					`[rentalService] Retrying ${validAddresses.length} accounts in smaller batches after RPC failure: ${summarizeRpcError(err)}`,
				);
				for (const smallerChunk of chunk(validAddresses, nextChunkSize)) {
					await this.fetchAccountsChunk(smallerChunk, profileId, out);
				}
				return;
			}
			const address = validAddresses[0];
			if (address) out.set(address, null);
			console.warn(
				`[rentalService] Skipping account ${address ?? 'unknown'} after repeated RPC failure: ${summarizeRpcError(err)}`,
			);
		}
	}

	// Recupera metadati delle flotte associate ai contratti (chiamata RPC per fleet)
	private async populateFleetMetadata(
		contracts: RentalContract[],
		profileId: string,
	): Promise<void> {
		const missing = Array.from(
			new Set(contracts.map((contract) => contract.fleet).filter((fleet) => !this.fleetMetaCache.has(fleet))),
		);
		if (missing.length > 0) {
			const fleetAccounts = await this.fetchAccountsByAddresses(missing, profileId);
			for (const address of missing) {
				const account = fleetAccounts.get(address);
				if (!account) {
					this.fleetMetaCache.set(address, {});
					continue;
				}
				const meta = decodeFleetMeta(account.data);
				if (!meta) {
					this.fleetMetaCache.set(address, {});
					continue;
				}
				this.fleetMetaCache.set(address, {
					fleet_name: meta.fleet_name,
					fleet_ships: meta.fleet_ships,
					starbase: meta.starbase,
					faction: meta.faction,
				});
			}
			await this.populateFleetCompositions(missing, profileId);
		}
		contracts.forEach((contract) => {
			const meta = this.fleetMetaCache.get(contract.fleet);
			if (!meta) return;
			if (meta.fleet_name) contract.fleet_name = meta.fleet_name;
			if (meta.fleet_composition) contract.fleet_composition = meta.fleet_composition;
			if (meta.fleet_ships) contract.fleet_ships = meta.fleet_ships;
			if (meta.starbase) contract.starbase = meta.starbase;
			if (typeof meta.faction === 'number') contract.faction = meta.faction;
		});
	}

	private async populateFleetCompositions(
		fleetAddresses: string[],
		profileId: string,
	): Promise<void> {
		const shipsAddresses = Array.from(
			new Set(
				fleetAddresses
					.map((fleetAddress) => this.fleetMetaCache.get(fleetAddress)?.fleet_ships)
					.filter((value): value is string => Boolean(value)),
			),
		);
		if (shipsAddresses.length === 0) return;
		const shipsAccounts = await this.fetchAccountsByAddresses(shipsAddresses, profileId);
		const entriesByShips = new Map<string, ReturnType<typeof decodeFleetShipsEntries>>();
		for (const address of shipsAddresses) {
			const account = shipsAccounts.get(address);
			if (!account) continue;
			const entries = decodeFleetShipsEntries(account.data).filter((entry) => entry.amount > 0);
			entriesByShips.set(address, entries);
		}
		const missingMints = Array.from(
			new Set(
				Array.from(entriesByShips.values())
					.flat()
					.map((entry) => entry.ship_mint)
					.filter((mint) => !this.shipNameCache.has(mint)),
			),
		);
		await this.populateShipNameCache(missingMints, profileId);
		for (const fleetAddress of fleetAddresses) {
			const meta = this.fleetMetaCache.get(fleetAddress);
			if (!meta?.fleet_ships) continue;
			const entries = entriesByShips.get(meta.fleet_ships);
			if (!entries || entries.length === 0) {
				meta.fleet_composition = 'No ships';
				continue;
			}
			const parts = entries.map((entry) => {
				const name = this.shipNameCache.get(entry.ship_mint) ?? entry.ship_mint.slice(0, 8);
				return entry.amount > 1 ? `${entry.amount}x ${name}` : name;
			});
			meta.fleet_composition = parts.join(', ');
		}
	}

	private async populateShipNameCache(mints: string[], profileId: string): Promise<void> {
		if (mints.length === 0) return;
		const accounts = await this.fetchAccountsByAddresses(mints, profileId);
		for (const mint of mints) {
			const account = accounts.get(mint);
			if (!account) {
				this.shipNameCache.set(mint, mint.slice(0, 8));
				continue;
			}
			const name = decodeShipName(account.data);
			this.shipNameCache.set(mint, name ?? mint.slice(0, 8));
		}
	}

	// Salva contracts in cache/contracts.json (unico per tutti i profili)
	async saveContractsToCache(_profileId: string, contracts: RentalContract[]): Promise<void> {
		try {
			const dir = path.join(process.cwd(), 'cache');
			await fs.mkdir(dir, { recursive: true });
			const file = path.join(dir, 'contracts.json');
			const now = new Date();
			const payload = {
				createdAt: now.toISOString(),
				contracts
			};
			await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
		} catch (err) {
			console.error(`[rentalService] Failed to save contracts cache:`, err);
		}
	}

	private resolveProfileId(profileId: string | undefined): string {
		const cleaned = profileId?.trim();
		return cleaned && cleaned.length > 0 ? cleaned : 'default';
	}

	private isFresh<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
		return !!cache && Date.now() - cache.at <= this.cacheTtlMs;
	}

	private async executeRpc<T>(
		profileId: string,
		operation: (connection: Connection) => Promise<T>,
	): Promise<T> {
		const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
		const maxAttempts = Math.min(6, Math.max(3, Math.round(pool.length * 1.5)));
		let lastError: unknown = null;

		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			let pick: Awaited<ReturnType<typeof RpcPoolManager.pickRpcConnection>> | null = null;
			const startedAt = Date.now();

			try {
				pick = await RpcPoolManager.pickRpcConnection(profileId, {
					waitForMs: 3000,
					allowStale: attempt > 2,
				});
				const endpointUrl = pick?.endpoint?.url ?? 'unknown-rpc';
				const result = await withRpcTimeout(
					operation(pick.connection as Connection),
					`rentalService.executeRpc ${endpointUrl}`,
				);
				pick.release({ success: true, latencyMs: Date.now() - startedAt });
				return result;
			} catch (error) {
				const errorType = getRpcErrorType(error);
				if (pick) {
					pick.release({
						success: false,
						latencyMs: Date.now() - startedAt,
						errorType,
					});
				}
				lastError = error;
				console.warn(
					`[rentalService] [executeRpc] Attempt ${attempt + 1}/${maxAttempts} failed for profileId=${profileId} rpc=${pick?.endpoint?.url ?? 'unknown-rpc'} type=${errorType}: ${summarizeRpcError(error)}`,
				);
				if (attempt + 1 < maxAttempts) {
					await sleep(getRpcRetryDelayMs(errorType, attempt + 1));
				}
			}
		}

		if (lastError instanceof Error) throw lastError;
		throw new Error('Rental RPC request failed');
	}

	private applyFilters(input: RentalContract[], options: ContractQueryOptions): RentalContract[] {
		let out = [...input];

		if (options.state === 'available') out = out.filter((contract) => contract.current_rental_state === null);
		if (options.state === 'active') out = out.filter((contract) => contract.current_rental_state !== null);
		if (options.starbase) out = out.filter((contract) => contract.starbase === options.starbase);

		if (options.q) {
			const query = options.q.trim().toLowerCase();
			out = out.filter((contract) =>
				[contract.address, contract.owner, contract.owner_profile, contract.fleet, contract.owner_token_account, contract.starbase ?? '']
					.join(' ')
					.toLowerCase()
					.includes(query),
			);
		}

		if (options.minRate !== undefined) out = out.filter((contract) => contract.rate >= options.minRate!);
		if (options.maxRate !== undefined) out = out.filter((contract) => contract.rate <= options.maxRate!);

		const limit = clampLimit(options.limit);
		if (limit !== undefined) out = out.slice(0, limit);

		return out;
	}

}
