import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolveNativeBinary } from '../src/utils/native-binaries';

test('resolveNativeBinary finds carbon_decoder even if cwd changes', () => {
  const originalCwd = process.cwd();
  const expectedPath = path.join(originalCwd, 'utility', 'bin', 'carbon_decoder');

  process.chdir('/tmp');
  try {
    const resolved = resolveNativeBinary('carbon_decoder');
    assert.equal(resolved, expectedPath);
  } finally {
    process.chdir(originalCwd);
  }
});
