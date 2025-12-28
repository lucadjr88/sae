import { describe, it, expect } from 'vitest';
import { parseSageTransaction } from '../../services/walletSageFeesStreaming/lib/parsers.js';

describe('parseSageTransaction', () => {
  it('should detect non-SAGE tx as Unknown', () => {
    const tx = { instructions: [], programIds: ['OTHER'], logMessages: [] };
    const result = parseSageTransaction(tx, {}, 'SAGE');
    expect(result.operation).toBe('Unknown');
    expect(result.isCrafting).toBe(false);
  });
  it('should detect crafting by OP_MAP', () => {
    const tx = { instructions: ['craft'], programIds: ['SAGE'], logMessages: [] };
    const result = parseSageTransaction(tx, { craft: 'Crafting' }, 'SAGE');
    expect(result.operation).toBe('Crafting');
    expect(result.isCrafting).toBe(true);
  });
});
