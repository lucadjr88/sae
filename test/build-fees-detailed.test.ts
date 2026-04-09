import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import buildFeesDetailed from '../src/utils/buildFeesDetailed';

test('buildFeesDetailed keeps unknown ops separate from recognized transaction totals and includes player ops fees', async () => {
  const profileId = `test-fees-${randomUUID()}`;
  const profileDir = path.join(process.cwd(), 'cache', profileId);
  const fleetBreakdownsDir = path.join(profileDir, 'fleet-breakdowns');
  const playerOpsDir = path.join(profileDir, 'player-ops');
  const unknownDir = path.join(profileDir, 'unknown');

  await fs.mkdir(fleetBreakdownsDir, { recursive: true });
  await fs.mkdir(playerOpsDir, { recursive: true });
  await fs.mkdir(unknownDir, { recursive: true });

  const fleetBreakdown = {
    fleet: { pubkey: 'fleet-1' },
    ops: [
      {
        signature: 'fleet-op-1',
        instructionName: 'MineAsteroid',
        txInfo: { fee: 4_000, blockTime: 1_700_000_000 }
      }
    ]
  };

  const playerOp = {
    signature: 'player-op-1',
    instructionName: 'TraderMarketBuy',
    success: true,
    txInfo: { fee: 6_000, blockTime: 1_700_000_100 }
  };

  const unknownOps = Array.from({ length: 3 }, (_, index) => ({
    signature: `unknown-op-${index + 1}`,
    instructionName: 'Unknown',
    success: false,
    txInfo: { fee: 9_999, blockTime: 1_700_000_200 + index }
  }));

  await fs.writeFile(path.join(fleetBreakdownsDir, 'fleet-1.json'), JSON.stringify(fleetBreakdown, null, 2), 'utf8');
  await fs.writeFile(path.join(playerOpsDir, 'player-op-1.json'), JSON.stringify(playerOp, null, 2), 'utf8');
  await Promise.all(
    unknownOps.map((op) => fs.writeFile(path.join(unknownDir, `${op.signature}.json`), JSON.stringify(op, null, 2), 'utf8'))
  );

  try {
    const summary = await buildFeesDetailed(profileId);

    assert.equal(summary.totalSignaturesFetched, 5);
    assert.equal(summary.transactionCount24h, 2);
    assert.equal(summary.unknownOperations, 3);
    assert.equal(summary.sageFees24h, 10_000);
    assert.equal(summary.feesByOperation.TraderMarketBuy?.totalFee, 6_000);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});
