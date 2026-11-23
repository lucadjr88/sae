import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test, { type TestContext } from 'node:test';
import { Connection, PublicKey } from '@solana/web3.js';
import { findPlayerProfilesForWalletWithRpc } from '../src/utils/derivePlayerProfilePDA.js';

const wallet = new PublicKey(Buffer.alloc(32, 1));
const cachedProfile = new PublicKey(Buffer.alloc(32, 2));
const newProfile = new PublicKey(Buffer.alloc(32, 3));
const endpoint = 'https://example.com';

function setup(t: TestContext, cached: boolean, failRpc: boolean, foundOnChain: boolean) {
  const calls: string[] = [];
  t.mock.method(fs, 'readFile', (async (file: unknown) => {
    if (String(file).endsWith('rpc-pool-complete.json')) return JSON.stringify([{ url: endpoint }]);
    return JSON.stringify({ allowedWallets: [{ pubkey: wallet.toBase58() }] });
  }) as typeof fs.readFile);
  t.mock.method(fs, 'writeFile', (async () => {}) as typeof fs.writeFile);
  t.mock.method(fs, 'readdir', (async () => {
    calls.push('cache');
    return cached ? [{ name: cachedProfile.toBase58(), isDirectory: () => true }] : [];
  }) as typeof fs.readdir);
  t.mock.method(Connection.prototype, 'getProgramAccounts', (async () => {
    calls.push('rpc');
    if (failRpc) throw new Error('RPC failed');
    if (!foundOnChain) return [];
    const data = Buffer.alloc(110);
    data.writeUInt16LE(1, 28);
    wallet.toBuffer().copy(data, 30);
    return [{
      pubkey: newProfile,
      account: { data, executable: false, lamports: 0, owner: wallet },
    }];
  }) as typeof Connection.prototype.getProgramAccounts);
  return calls;
}

test('on-chain profiles take precedence over cached profiles', async (t) => {
  const calls = setup(t, true, false, true);
  const profiles = await findPlayerProfilesForWalletWithRpc(wallet);
  assert.deepEqual(profiles.map(profile => profile.profileId), [newProfile.toBase58()]);
  assert.deepEqual(calls, ['rpc']);
});

test('empty on-chain results fall back to cached profiles', async (t) => {
  const calls = setup(t, true, false, false);
  const profiles = await findPlayerProfilesForWalletWithRpc(wallet);
  assert.deepEqual(profiles.map(profile => profile.profileId), [cachedProfile.toBase58()]);
  assert.deepEqual(calls, ['rpc', 'cache']);
});

test('RPC failure falls back to cached profiles', async (t) => {
  const calls = setup(t, true, true, false);
  const profiles = await findPlayerProfilesForWalletWithRpc(wallet);
  assert.deepEqual(profiles.map(profile => profile.profileId), [cachedProfile.toBase58()]);
  assert.deepEqual(calls, ['rpc', 'cache']);
});

test('empty results and RPC failure remain distinguishable without cache', async (t) => {
  await t.test('empty result', async (t) => {
    setup(t, false, false, false);
    assert.deepEqual(await findPlayerProfilesForWalletWithRpc(wallet), []);
  });
  await t.test('RPC failure', async (t) => {
    setup(t, false, true, false);
    const profiles = await findPlayerProfilesForWalletWithRpc(wallet);
    assert.equal(profiles[0].source, 'search failed');
    assert.equal(profiles[0].profileId, '');
  });
});
