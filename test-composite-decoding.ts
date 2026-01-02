import fs from 'fs';
import path from 'path';
import { Connection } from '@solana/web3.js';
import { decodeCompositeInstructions } from './src/decoders/composite-decoder.js';
import { RPC_ENDPOINT } from './src/config/serverConfig.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const txHash = '126nmkku2upmCTNmRaiZMvQzn6nRA5pEPYNKYk6BWY71FiR9hGBx6oQEDjq3KJ6uVP5C5xp5uMk3xarPWZvaGEhN';
const cacheFile = path.join(__dirname, 'cache/wallet-txs/9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY', `${txHash}.json`);

async function test() {
  console.log(`Testing composite decoding for TX: ${txHash}`);
  
  let txJson;
  if (fs.existsSync(cacheFile)) {
    txJson = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } else {
    console.log('Cache not found, fetching from RPC...');
    const connection = new Connection(RPC_ENDPOINT);
    const tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    if (!tx) {
      console.error('Transaction not found on chain');
      return;
    }
    txJson = tx;
  }

  const result = decodeCompositeInstructions(txJson);

  console.log('--- Decoding Result ---');
  console.log(`Is Composite: ${result.isComposite}`);
  console.log(`SAGE Instruction Count: ${result.sageInstructionCount}`);
  console.log(`Engine Used: ${result.engine}`);
  console.log('Instructions:');
  
  result.instructions.forEach((ix, i) => {
    console.log(`  [${i}] Name: ${ix.instructionName}`);
    console.log(`      Success: ${ix.success}`);
    if (ix.error) console.log(`      Error: ${ix.error}`);
    // console.log(`      Data:`, JSON.stringify(ix.decoded, null, 2));
  });
}

test().catch(console.error);
