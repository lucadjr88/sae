import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHourlyFeeSeries } from '../src/utils/buildFeesDetailed';

test('buildHourlyFeeSeries returns 24 hourly buckets ordered from oldest to newest', () => {
  const nowSec = 1_700_000_000;
  const series = buildHourlyFeeSeries([
    { blockTime: nowSec - (30 * 60), fee: 2_000_000_000 },
    { blockTime: nowSec - (90 * 60), fee: 1_000_000_000 },
    { blockTime: nowSec - (23 * 60 * 60), fee: 500_000_000 },
    { blockTime: nowSec - (26 * 60 * 60), fee: 9_000_000_000 },
  ], nowSec);

  assert.equal(series.length, 24);
  assert.equal(series[23], 2_000_000_000);
  assert.equal(series[22], 1_000_000_000);
  assert.equal(series[0], 500_000_000);
  assert.equal(series.reduce((sum, value) => sum + value, 0), 3_500_000_000);
});
