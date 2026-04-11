import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeInstructions } from '../src/decoders/decodeInstructions.js';

const TRADER_PROGRAM_ID = 'traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg';
const ATLAS_MINT = 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx';
const AMMO_MINT = 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK';
const MARKET_AMMO_ALIAS_MINT = 'EqXFCQHVoo89UjSUqPbLLt1T6zRKhT3E13AzF3unUs9G';
const PROCESS_EXCHANGE_DISCRIMINATOR = [112, 194, 63, 99, 52, 147, 85, 48];

function buildTraderBuyTx(signer: string | { toBase58: () => string; toString: () => string }) {
  const signerOwner = typeof signer === 'string' ? signer : signer.toBase58();

  return {
    signature: '2Pm9YWNSGZBL4fwvsiVqCAGQYQEZeYhtETZYkAeZHEj48HxpUsXdmNUBdV6BpB1CXq5jzoxxaioTzzwYnZcmUP7v',
    blockTime: 1_712_345_678,
    slot: 123,
    meta: {
      fee: 5000,
      err: null,
      logMessages: [
        `Program ${TRADER_PROGRAM_ID} invoke [1]`,
        'Program log: Instruction: ProcessExchange',
        'Program log: Order exchange successful'
      ],
      preTokenBalances: [
        {
          accountIndex: 3,
          mint: ATLAS_MINT,
          owner: signerOwner,
          uiTokenAmount: { amount: '250000000', decimals: 8, uiAmount: 2.5, uiAmountString: '2.5' }
        },
        {
          accountIndex: 4,
          mint: AMMO_MINT,
          owner: signerOwner,
          uiTokenAmount: { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 3,
          mint: ATLAS_MINT,
          owner: signerOwner,
          uiTokenAmount: { amount: '150000000', decimals: 8, uiAmount: 1.5, uiAmountString: '1.5' }
        },
        {
          accountIndex: 4,
          mint: AMMO_MINT,
          owner: signerOwner,
          uiTokenAmount: { amount: '100', decimals: 0, uiAmount: 100, uiAmountString: '100' }
        }
      ],
      innerInstructions: []
    },
    transaction: {
      message: {
        staticAccountKeys: [signer, TRADER_PROGRAM_ID],
        compiledInstructions: [
          { programIdIndex: 1, accountKeyIndexes: [], data: '' }
        ],
        addressTableLookups: []
      }
    }
  };
}

test('categorizes trader-only ammo purchases as TraderMarketBuy ops', () => {
  const signer = 'Wallet1111111111111111111111111111111111111';
  const tx = buildTraderBuyTx(signer);

  const [decoded] = decodeInstructions([tx]);

  assert.equal(decoded.success, true);
  assert.equal(decoded.instructionName, 'TraderMarketBuy');
  assert.equal(decoded.decoded?.[0]?.name, 'TraderMarketBuy');
  assert.equal(decoded.signature, tx.signature);
});

test('categorizes trader buys even when the signer key is a PublicKey-like object', () => {
  const signer = {
    toBase58: () => 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv',
    toString: () => 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv'
  };
  const tx = buildTraderBuyTx(signer);

  const [decoded] = decodeInstructions([tx]);

  assert.equal(decoded.success, true);
  assert.equal(decoded.instructionName, 'TraderMarketBuy');
  assert.equal(decoded.decoded?.[0]?.name, 'TraderMarketBuy');
});

test('extracts official marketplace asset and currency mints from ProcessExchange accounts', () => {
  const signer = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
  const tx = {
    signature: 'sig-trader-market-mints',
    blockTime: 1_712_345_679,
    slot: 124,
    meta: {
      fee: 5000,
      err: null,
      logMessages: [
        `Program ${TRADER_PROGRAM_ID} invoke [1]`,
        'Program log: Instruction: ProcessExchange',
        'Program log: Order exchange successful'
      ],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: ATLAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '200000000', decimals: 8, uiAmount: 2, uiAmountString: '2' }
        },
        {
          accountIndex: 2,
          mint: MARKET_AMMO_ALIAS_MINT,
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
          mint: MARKET_AMMO_ALIAS_MINT,
          owner: signer,
          uiTokenAmount: { amount: '1000000', decimals: 0, uiAmount: 1000000, uiAmountString: '1000000' }
        }
      ],
      loadedAddresses: {
        writable: [],
        readonly: [ATLAS_MINT, AMMO_MINT]
      },
      innerInstructions: []
    },
    transaction: {
      message: {
        staticAccountKeys: [signer, 'WalletDeposit1111111111111111111111111111111', 'WalletReceive111111111111111111111111111111', TRADER_PROGRAM_ID],
        compiledInstructions: [
          {
            programIdIndex: 3,
            accountKeyIndexes: [0, 1, 2, 4, 5],
            data: { type: 'Buffer', data: [...PROCESS_EXCHANGE_DISCRIMINATOR, 0, 0, 0, 0, 0, 0, 0, 0] }
          }
        ],
        addressTableLookups: []
      }
    }
  };

  const [decoded] = decodeInstructions([tx]);

  assert.equal(decoded.success, true);
  assert.equal(decoded.instructionName, 'TraderMarketSell');
  assert.equal(decoded.decoded?.[0]?.name, 'TraderMarketSell');
  assert.equal(decoded.decoded?.[0]?.data?.trader?.currencyMint, ATLAS_MINT);
  assert.equal(decoded.decoded?.[0]?.data?.trader?.assetMint, AMMO_MINT);
});
