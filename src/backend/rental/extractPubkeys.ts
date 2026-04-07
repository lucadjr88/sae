import { decodeContractState, decodeRentalState } from './decode.js';

export function extractRentalStatePubkeys(contractBuffers: Buffer[]): string[] {
  const pubkeys: string[] = [];
  for (const buf of contractBuffers) {
    const decoded = decodeContractState(new Uint8Array(buf));
    if (decoded && decoded.current_rental_state && decoded.current_rental_state !== '11111111111111111111111111111111') {
      pubkeys.push(decoded.current_rental_state);
    }
  }
  return pubkeys;
}

export function extractFleetPubkeys(contractBuffers: Buffer[]): string[] {
  const pubkeys: string[] = [];
  for (const buf of contractBuffers) {
    const decoded = decodeContractState(new Uint8Array(buf));
    if (decoded && decoded.fleet && decoded.fleet !== '11111111111111111111111111111111') {
      pubkeys.push(decoded.fleet);
    }
  }
  return pubkeys;
}

export function extractThreadPubkeys(rentalBuffers: Buffer[]): string[] {
  const pubkeys: string[] = [];
  for (const buf of rentalBuffers) {
    const decoded = decodeRentalState(new Uint8Array(buf));
    if (decoded && decoded.thread && decoded.thread !== '11111111111111111111111111111111') {
      pubkeys.push(decoded.thread);
    }
  }
  return pubkeys;
}
