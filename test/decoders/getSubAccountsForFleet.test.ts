import { getSubAccountsForFleet } from '../../src/decoders/getSubAccountsForFleet';
import fs from 'fs';
import path from 'path';

describe('getSubAccountsForFleet', () => {
  const testFleetKey = 'testFleetKey';
  const cacheDir = 'cache/fleets';
  const cachePath = path.join(cacheDir, `${testFleetKey}.json`);

  beforeAll(() => {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ subAccounts: ['A', 'B', 'C'] }), 'utf8');
  });

  afterAll(() => {
    fs.unlinkSync(cachePath);
  });

  it('restituisce subAccounts per fleetKey valido', () => {
    expect(getSubAccountsForFleet(testFleetKey, cacheDir)).toEqual(['A', 'B', 'C']);
  });

  it('restituisce array vuoto per fleetKey non esistente', () => {
    expect(getSubAccountsForFleet('nonEsistente', cacheDir)).toEqual([]);
  });

  it('restituisce array vuoto per cache corrotta', () => {
    fs.writeFileSync(cachePath, 'corrupted', 'utf8');
    expect(getSubAccountsForFleet(testFleetKey, cacheDir)).toEqual([]);
    fs.writeFileSync(cachePath, JSON.stringify({ subAccounts: ['A', 'B', 'C'] }), 'utf8');
  });
});
