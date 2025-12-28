import { describe, it, expect } from 'vitest';
import { decode } from '../../src/decoders/index';

describe('sage-crafting-decoder', () => {
  it('decodes craft logs', () => {
    const logs = ['Program log: Crafting started: ore'];
    const result = decode(logs);
    expect(result).toBeDefined();
    expect(result?.material).toBeDefined();
  });
});
