import assert from 'node:assert/strict';
import test from 'node:test';

import { pickOptimisticRentalRate } from '../src/backend/rental/rentalCacheUtils';
import { computeDisplayedRentalTotal } from '../frontend/src/utils/rentalDisplay';

test('keeps the contract/seed rate when the confirmed rental-state rate is zero', () => {
  assert.equal(pickOptimisticRentalRate(1, 0), 1);
});

test('falls back to confirmed rate only when seed rate is missing', () => {
  assert.equal(pickOptimisticRentalRate(undefined, 3), 3);
});

test('computes the total from the actual rental window in days', () => {
  assert.equal(
    computeDisplayedRentalTotal({
      rental_start_time: 1_000,
      rental_end_time: 1_000 + (2 * 24 * 60 * 60),
      rate: 1,
    }),
    '2.00',
  );
});

test('shows 0.00 instead of dash when the rate is explicitly zero', () => {
  assert.equal(
    computeDisplayedRentalTotal({
      rental_start_time: 1_000,
      rental_end_time: 1_000 + (2 * 24 * 60 * 60),
      rate: 0,
    }),
    '0.00',
  );
});
