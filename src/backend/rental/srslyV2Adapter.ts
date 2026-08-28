import type { ContractState, RentalState } from '@sly-rentals/core/codama';

import type { RentalContract } from './types.js';

const STARDUST_PER_ATLAS = 100_000_000n;
const SECONDS_PER_DAY = 86_400n;
const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111';

export interface SrslyV2ContractRecord {
	address: string;
	data: ContractState;
}

export interface SrslyV2RentalRecord {
	address: string;
	data: RentalState;
}

export interface SrslyV2AdapterOptions {
	ownerTokenAccount?: string;
}

function address(value: string): string {
	return value;
}

function isEmptyAddress(value: string): boolean {
	return value === SYSTEM_PROGRAM_ADDRESS;
}

function toSafeNumber(value: bigint): number {
	const result = Number(value);
	return Number.isSafeInteger(result) || Number.isFinite(result) ? result : 0;
}

function toAtlas(rateStardust: bigint): number {
	return Number(rateStardust) / Number(STARDUST_PER_ATLAS);
}

function toDays(seconds: bigint): number {
	return Number(seconds) / Number(SECONDS_PER_DAY);
}

function rentalStatus(contract: ContractState): RentalContract['rental_status'] {
	if (!isEmptyAddress(address(contract.activeRental))) return 'active';
	if (!isEmptyAddress(address(contract.queuedRental))) return 'queued';
	return contract.toClose ? 'cancelled' : 'available';
}

function legacyPaymentFrequency(): string {
	return 'daily';
}

export function mapSrslyV2Contract(
	record: SrslyV2ContractRecord,
	options: SrslyV2AdapterOptions = {},
): RentalContract {
	const contract = record.data;
	const activeRental = isEmptyAddress(address(contract.activeRental))
		? null
		: address(contract.activeRental);
	const queuedRental = isEmptyAddress(address(contract.queuedRental))
		? null
		: address(contract.queuedRental);

	return {
		address: record.address,
		rental_version: 2,
		owner: address(contract.owner),
		owner_profile: address(contract.ownerProfile),
		fleet: address(contract.fleet),
		game_id: address(contract.gameId),
		rate: toAtlas(contract.rate),
		rate_stardust: contract.rate.toString(),
		duration_min: toDays(contract.durationMinSeconds),
		duration_max: toDays(contract.durationMaxSeconds),
		duration_min_seconds: contract.durationMinSeconds.toString(),
		duration_max_seconds: contract.durationMaxSeconds.toString(),
		payment_frequency: legacyPaymentFrequency(),
		to_close: contract.toClose,
		current_rental_state: activeRental,
		active_rental: activeRental,
		queued_rental: queuedRental,
		rental_status: rentalStatus(contract),
		cancel_delay_seconds: contract.cancelDelayMin.toString(),
		reservations_disabled: contract.reservationsDisabled,
		weight: contract.weight,
		managed_token_account: address(contract.managedTokenAccount),
		owner_token_account: options.ownerTokenAccount ?? '',
	};
}

export function mapSrslyV2Rental(record: SrslyV2RentalRecord): {
	address: string;
	borrower: string;
	contract: string;
	rate: number;
	start_time: number;
	end_time: number;
	cancelled: boolean;
} {
	const rental = record.data;

	return {
		address: record.address,
		borrower: address(rental.borrower),
		contract: address(rental.contract),
		rate: toAtlas(rental.rate),
		start_time: toSafeNumber(rental.startTime),
		end_time: toSafeNumber(rental.endTime),
		cancelled: rental.status === 3,
	};
}