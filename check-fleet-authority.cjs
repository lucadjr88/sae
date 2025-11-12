const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
const YOUR_WALLET = '7sZFMdaGCATXsJuWfj19ExnLt9P7RVm4Bykmvz2Jrh5x';

async function checkFleetAuthority() {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  
  // Check the 3 borrowed fleets
  const borrowedFleets = [
    { name: 'Atlantic Cod Fleet', pubkey: 'GNofosk53LVzcAz51f7p1XWPkpBnv1bGybNJeUrciZfE' },
    { name: 'Donkey Fleet', pubkey: 'Bf4frq5oyagGBNH621SA6ShMoLeCnd3iEWXw7zTAwp2z' },
    { name: 'mining Fleet', pubkey: 'Ex9BtiHnu2fjznTyDY5xwR11dW54Hy6j9NpGfU4AhREU' },
  ];
  
  console.log('Checking fleet transaction signatures...\n');
  
  for (const fleet of borrowedFleets) {
    console.log(`=== ${fleet.name} (${fleet.pubkey}) ===`);
    
    try {
      // Get recent transactions for this fleet
      const signatures = await connection.getSignaturesForAddress(
        new PublicKey(fleet.pubkey),
        { limit: 10 }
      );
      
      console.log(`Found ${signatures.length} recent transactions`);
      
      if (signatures.length > 0) {
        // Check the first few transactions to see who signed them
        for (let i = 0; i < Math.min(3, signatures.length); i++) {
          const sig = signatures[i];
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
          
          if (tx && tx.transaction.message.accountKeys.length > 0) {
            const signer = tx.transaction.message.accountKeys[0].pubkey.toString();
            console.log(`  TX ${i + 1}: Signer = ${signer}`);
            console.log(`         Signer is YOUR wallet? ${signer === YOUR_WALLET}`);
          }
        }
      }
      
      console.log('');
    } catch (error) {
      console.error('Error:', error.message);
      console.log('');
    }
  }
}

checkFleetAuthority();
