
import { getAccountTransactions } from './src/examples/account-transactions.js';
import { RPC_ENDPOINT, RPC_WEBSOCKET } from './src/config/serverConfig.js';

async function test() {
  const wallet = '9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY';
  const fleet = '7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5';
  
  console.log('Fetching transactions for wallet:', wallet);
  const res = await getAccountTransactions(
    RPC_ENDPOINT,
    RPC_WEBSOCKET,
    wallet,
    500,
    Date.now() - (24 * 60 * 60 * 1000),
    1000,
    { refresh: true }
  );

  const fleetTx = res.transactions.filter(tx => tx.accountKeys.includes(fleet));
  console.log(`Found ${fleetTx.length} transactions for fleet ${fleet}`);

  fleetTx.forEach(tx => {
    console.log(`TX: ${tx.signature}`);
    console.log(`  Instructions: ${tx.instructions.join(', ')}`);
    if (tx.compositeDecoded) {
      console.log(`  Composite: ${tx.compositeDecoded.engine} - ${tx.compositeDecoded.instructions.length} ix`);
    }
  });
}

test().catch(console.error);
