import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProcessLogPrefix } from '../src/utils/log-context';

test('buildProcessLogPrefix includes ISO date/time and process identifiers', () => {
  const previousPmId = process.env.pm_id;
  process.env.pm_id = '7';

  try {
    const prefix = buildProcessLogPrefix(new Date('2026-04-10T12:34:56.789Z'));
    assert.match(prefix, /^\[2026-04-10T12:34:56\.789Z\] \[pid=\d+\] \[pm2=7\]$/);
  } finally {
    if (previousPmId === undefined) {
      delete process.env.pm_id;
    } else {
      process.env.pm_id = previousPmId;
    }
  }
});
