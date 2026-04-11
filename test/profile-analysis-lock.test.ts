import assert from 'node:assert/strict';
import test from 'node:test';

import { acquireProfileAnalysisLock } from '../src/utils/profile-analysis-lock';
import { shouldServeCachedPlayloadAfterLockWait } from '../src/analysis/analyzeProfile.js';

test('acquireProfileAnalysisLock serializes concurrent work for the same profile', async () => {
  const profileId = `lock-test-${Date.now()}`;

  const firstRelease = await acquireProfileAnalysisLock(profileId, { staleMs: 5_000 });
  assert.ok(firstRelease, 'first acquisition should succeed');

  const secondRelease = await acquireProfileAnalysisLock(profileId, { staleMs: 5_000 });
  assert.equal(secondRelease, null, 'second acquisition should be blocked while the lock is held');

  await firstRelease?.();

  const thirdRelease = await acquireProfileAnalysisLock(profileId, { staleMs: 5_000 });
  assert.ok(thirdRelease, 'lock should be acquirable again after release');
  await thirdRelease?.();
});

test('wipeCache requests do not reuse cached playloads after waiting on the profile lock', () => {
  const cachedPayload = { fleets: [{ id: 'fleet-1' }], sageFees24h: 42, transactionCount24h: 3 };

  assert.equal(shouldServeCachedPlayloadAfterLockWait(false, cachedPayload), true);
  assert.equal(shouldServeCachedPlayloadAfterLockWait(true, cachedPayload), false);
  assert.equal(shouldServeCachedPlayloadAfterLockWait(false, null), false);
});
