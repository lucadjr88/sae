import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { decodeResources } from '../src/utils/resources_analyses.js';

const ATLAS_MINT = 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx';
const AMMO_MINT = 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK';
const AMMO_MARKET_ALIAS_MINT = 'EqXFCQHVoo89UjSUqPbLLt1T6zRKhT3E13AzF3unUs9G';

test('decodeResources counts trader buys from playerOps as claim-in and burn-out', async () => {
  const profileId = `test-trader-${randomUUID()}`;
  const profileDir = path.join(process.cwd(), 'cache', profileId);
  const playerOpsDir = path.join(profileDir, 'player-ops');
  await fs.mkdir(playerOpsDir, { recursive: true });

  const signer = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
  const op = {
    signature: 'sig-trader-buy',
    instructionName: 'TraderMarketBuy',
    success: true,
    txInfo: {
      staticAccountKeys: [signer],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '200000000', decimals: 8, uiAmount: 2, uiAmountString: '2' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100000000', decimals: 8, uiAmount: 1, uiAmountString: '1' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100', decimals: 0, uiAmount: 100, uiAmountString: '100' }
        }
      ]
    }
  };

  await fs.writeFile(path.join(playerOpsDir, 'sig-trader-buy.json'), JSON.stringify(op, null, 2), 'utf8');

  try {
    const summary = await decodeResources(profileId);

    assert.equal(summary.byOperation.TraderMarketBuy?.materialsProduced?.[AMMO_MINT], 100);
    assert.equal(summary.byOperation.TraderMarketBuy?.materialsConsumed?.[ATLAS_MINT], 1);
    assert.equal(summary.byMaterial[AMMO_MINT]?.totalIn, 100);
    assert.equal(summary.byMaterial[ATLAS_MINT]?.totalOut, 1);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});

test('decodeResources classifies full ProcessExchange sell listings as TraderMarketSell even for the buyer wallet flow', async () => {
  const profileId = `test-trader-market-side-${randomUUID()}`;
  const profileDir = path.join(process.cwd(), 'cache', profileId);
  const playerOpsDir = path.join(profileDir, 'player-ops');
  await fs.mkdir(playerOpsDir, { recursive: true });

  const signer = '6HHXmh9djqKKWmxs7GBrMtF92JTvLLKN1VY8Y7rtmapx';
  const takerDeposit = 'BuyerAtlasAta111111111111111111111111111111';
  const takerReceive = 'BuyerAmmoAta1111111111111111111111111111111';
  const initializerDeposit = 'SellerAmmoEscrow111111111111111111111111111';
  const initializerReceive = 'SellerAtlasAta111111111111111111111111111111';
  const op = {
    signature: 'sig-trader-market-side-sell',
    instructionName: 'TraderMarketBuy',
    success: true,
    txInfo: {
      staticAccountKeys: [signer, takerDeposit, takerReceive, initializerDeposit, initializerReceive],
      traderInfo: {
        currencyMint: ATLAS_MINT,
        assetMint: AMMO_MINT,
        orderTakerDepositTokenAccount: takerDeposit,
        orderTakerReceiveTokenAccount: takerReceive,
        initializerDepositTokenAccount: initializerDeposit,
        initializerReceiveTokenAccount: initializerReceive
      },
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '200000000', decimals: 8, uiAmount: 2, uiAmountString: '2' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        },
        {
          accountIndex: 3,
          mint: AMMO_MINT,
          owner: 'Seller111111111111111111111111111111111111',
          uiTokenAmount: { amount: '100', decimals: 0, uiAmount: 100, uiAmountString: '100' }
        },
        {
          accountIndex: 4,
          mint: ATLAS_MINT,
          owner: 'Seller111111111111111111111111111111111111',
          uiTokenAmount: { amount: '0', decimals: 8, uiAmount: 0, uiAmountString: '0' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100000000', decimals: 8, uiAmount: 1, uiAmountString: '1' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100', decimals: 0, uiAmount: 100, uiAmountString: '100' }
        },
        {
          accountIndex: 3,
          mint: AMMO_MINT,
          owner: 'Seller111111111111111111111111111111111111',
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        },
        {
          accountIndex: 4,
          mint: ATLAS_MINT,
          owner: 'Seller111111111111111111111111111111111111',
          uiTokenAmount: { amount: '100000000', decimals: 8, uiAmount: 1, uiAmountString: '1' }
        }
      ]
    }
  };

  await fs.writeFile(path.join(playerOpsDir, 'sig-trader-market-side-sell.json'), JSON.stringify(op, null, 2), 'utf8');

  try {
    const summary = await decodeResources(profileId);

    assert.equal(summary.byOperation.TraderMarketSell?.materialsProduced?.[ATLAS_MINT], 1);
    assert.equal(summary.byOperation.TraderMarketSell?.materialsConsumed?.[AMMO_MINT], 100);
    assert.equal(summary.byMaterial[ATLAS_MINT]?.totalIn, 1);
    assert.equal(summary.byMaterial[AMMO_MINT]?.totalOut, 100);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});

test('decodeResources reclassifies trader market ops as sell when owned flows are asset-out and ATLAS-in', async () => {
  const profileId = `test-trader-sell-${randomUUID()}`;
  const profileDir = path.join(process.cwd(), 'cache', profileId);
  const playerOpsDir = path.join(profileDir, 'player-ops');
  await fs.mkdir(playerOpsDir, { recursive: true });

  const signer = '6HHXmh9djqKKWmxs7GBrMtF92JTvLLKN1VY8Y7rtmapx';
  const op = {
    signature: 'sig-trader-sell-from-owned-flows',
    instructionName: 'TraderMarketBuy',
    success: true,
    txInfo: {
      staticAccountKeys: [signer],
      traderInfo: {
        currencyMint: ATLAS_MINT,
        assetMint: AMMO_MINT
      },
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100000000', decimals: 8, uiAmount: 1, uiAmountString: '1' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100', decimals: 0, uiAmount: 100, uiAmountString: '100' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '200000000', decimals: 8, uiAmount: 2, uiAmountString: '2' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MINT,
          owner: signer,
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        }
      ]
    }
  };

  await fs.writeFile(path.join(playerOpsDir, 'sig-trader-sell.json'), JSON.stringify(op, null, 2), 'utf8');

  try {
    const summary = await decodeResources(profileId);

    assert.equal(summary.byOperation.TraderMarketSell?.materialsProduced?.[ATLAS_MINT], 1);
    assert.equal(summary.byOperation.TraderMarketSell?.materialsConsumed?.[AMMO_MINT], 100);
    assert.equal(summary.byOperation.TraderMarketBuy, undefined);
    assert.equal(summary.byMaterial[ATLAS_MINT]?.totalIn, 1);
    assert.equal(summary.byMaterial[AMMO_MINT]?.totalOut, 100);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});

test('decodeResources remaps trader market alias mints back to the canonical resource mint', async () => {
  const profileId = `test-trader-alias-${randomUUID()}`;
  const profileDir = path.join(process.cwd(), 'cache', profileId);
  const playerOpsDir = path.join(profileDir, 'player-ops');
  await fs.mkdir(playerOpsDir, { recursive: true });

  const signer = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
  const op = {
    signature: 'sig-trader-buy-alias',
    instructionName: 'TraderMarketBuy',
    success: true,
    txInfo: {
      staticAccountKeys: [signer],
      traderInfo: {
        currencyMint: ATLAS_MINT,
        assetMint: AMMO_MINT
      },
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '200000000', decimals: 8, uiAmount: 2, uiAmountString: '2' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MARKET_ALIAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        },
        {
          accountIndex: 3,
          mint: AMMO_MINT,
          owner: 'SomeAta11111111111111111111111111111111111',
          uiTokenAmount: { amount: '999', decimals: 0, uiAmount: 999, uiAmountString: '999' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '100000000', decimals: 8, uiAmount: 1, uiAmountString: '1' }
        },
        {
          accountIndex: 2,
          mint: AMMO_MARKET_ALIAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '1000000', decimals: 0, uiAmount: 1000000, uiAmountString: '1000000' }
        },
        {
          accountIndex: 3,
          mint: AMMO_MINT,
          owner: 'SomeAta11111111111111111111111111111111111',
          uiTokenAmount: { amount: '999', decimals: 0, uiAmount: 999, uiAmountString: '999' }
        }
      ]
    }
  };

  await fs.writeFile(path.join(playerOpsDir, 'sig-trader-buy-alias.json'), JSON.stringify(op, null, 2), 'utf8');

  try {
    const summary = await decodeResources(profileId);

    assert.equal(summary.byOperation.TraderMarketBuy?.materialsProduced?.[AMMO_MINT], 1000000);
    assert.equal(summary.byMaterial[AMMO_MINT]?.totalIn, 1000000);
    assert.equal(summary.byMaterial[AMMO_MARKET_ALIAS_MINT], undefined);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});
