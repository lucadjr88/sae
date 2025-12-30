import { OpType, isValidOpType } from '../../src/decoders/OpType';

describe('OpType enum e validazione', () => {
  it('accetta solo valori supportati', () => {
    expect(isValidOpType('cargo')).toBe(true);
    expect(isValidOpType('fees')).toBe(true);
    expect(isValidOpType('crafting')).toBe(true);
    expect(isValidOpType('staking')).toBe(true);
    expect(isValidOpType('invalid')).toBe(false);
    expect(isValidOpType('')).toBe(false);
  });
});
