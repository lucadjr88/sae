import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';

import { RentalService } from '../src/backend/rental/rentalService';

const PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const PROFILE_ID = 'default';
const VALID_ADDRESSES = [
  '11111111111111111111111111111111',
  'Stake11111111111111111111111111111111111111',
  'Vote111111111111111111111111111111111111111',
  'Config1111111111111111111111111111111111111',
];

test('fetchAccountsByAddresses retries failed multi-account chunks with smaller batches', async () => {
  const service = new RentalService(PROGRAM_ID, 30_000) as any;
  const attemptedBatchSizes: number[] = [];

  service.executeRpc = async (_profileId: string, operation: (connection: any) => Promise<any>) => {
    return operation({
      async getMultipleAccountsInfo(pubkeys: PublicKey[]) {
        attemptedBatchSizes.push(pubkeys.length);
        if (pubkeys.length > 2) {
          throw new Error('simulated Internal JSON-RPC error');
        }
        return pubkeys.map(() => ({ data: Buffer.from([1, 2, 3]) }));
      },
    });
  };

  const result = await service.fetchAccountsByAddresses(VALID_ADDRESSES, PROFILE_ID);

  assert.equal(result.size, VALID_ADDRESSES.length);
  assert.deepEqual(attemptedBatchSizes, [4, 2, 2]);
  for (const address of VALID_ADDRESSES) {
    assert.ok(result.get(address));
  }
});

test('fetchAccountsByAddresses degrades to null for a permanently failing single account', async () => {
  const service = new RentalService(PROGRAM_ID, 30_000) as any;
  const badAddress = VALID_ADDRESSES[1];

  service.executeRpc = async (_profileId: string, operation: (connection: any) => Promise<any>) => {
    return operation({
      async getMultipleAccountsInfo(pubkeys: PublicKey[]) {
        if (pubkeys.some((pubkey) => pubkey?.toBase58() === badAddress)) {
          throw new Error('simulated Internal JSON-RPC error');
        }
        return pubkeys.map(() => ({ data: Buffer.from([9, 9, 9]) }));
      },
    });
  };

  const result = await service.fetchAccountsByAddresses(VALID_ADDRESSES.slice(0, 2), PROFILE_ID);

  assert.ok(result.get(VALID_ADDRESSES[0]));
  assert.equal(result.get(badAddress), null);
});
