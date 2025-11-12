const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';

async function checkSpecificFleet(fleetPubkey) {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const profilePubkey = new PublicKey('AAozfxCznAp5WNMFYd5medXuTh3MKM3u3LXBufhc1nhi');
  
  console.log('Checking fleet:', fleetPubkey);
  console.log('Your profile:', profilePubkey.toString());
  console.log('');
  
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(fleetPubkey));
    
    if (!accountInfo) {
      console.log('Fleet account not found!');
      return;
    }
    
    const data = accountInfo.data;
    console.log('Account data length:', data.length);
    
    // Read owningProfile at offset 41
    const owningProfileBytes = data.slice(41, 41 + 32);
    const owningProfile = new PublicKey(owningProfileBytes).toString();
    
    // Read subProfile at offset 73
    const subProfileBytes = data.slice(73, 73 + 32);
    const subProfile = new PublicKey(subProfileBytes).toString();
    
    console.log('Offset 41 (owningProfile):', owningProfile);
    console.log('Offset 73 (subProfile):', subProfile);
    console.log('');
    console.log('owningProfile matches your profile?', owningProfile === profilePubkey.toString());
    console.log('subProfile matches your profile?', subProfile === profilePubkey.toString());
    console.log('');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function findRentedFleets() {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const profilePubkey = new PublicKey('AAozfxCznAp5WNMFYd5medXuTh3MKM3u3LXBufhc1nhi');

  console.log('='.repeat(80));
  console.log('CHECKING YOUR 3 BORROWED FLEETS');
  console.log('='.repeat(80));
  console.log('');
  
  // Check all 3 borrowed fleets
  await checkSpecificFleet('GNofosk53LVzcAz51f7p1XWPkpBnv1bGybNJeUrciZfE'); // Atlantic Cod Fleet
  console.log('-'.repeat(80));
  console.log('');
  await checkSpecificFleet('Bf4frq5oyagGBNH621SA6ShMoLeCnd3iEWXw7zTAwp2z'); // Donkey Fleet
  console.log('-'.repeat(80));
  console.log('');
  await checkSpecificFleet('Ex9BtiHnu2fjznTyDY5xwR11dW54Hy6j9NpGfU4AhREU'); // mining Fleet
  console.log('='.repeat(80));
  console.log('');
  
  console.log('Now searching ALL SAGE program for rented fleets (subProfile)...');
  console.log('This may take a moment...\n');
  
  try {
    // Search for fleets where subProfile matches
    const accounts = await connection.getProgramAccounts(
      new PublicKey(SAGE_PROGRAM_ID),
      {
        filters: [
          {
            memcmp: {
              offset: 73, // subProfile offset
              bytes: profilePubkey.toBase58(),
            },
          },
        ],
      }
    );
    
    console.log(`Found ${accounts.length} accounts with subProfile matching your profile\n`);
    
    accounts.forEach((account, index) => {
      console.log(`=== Account ${index + 1} ===`);
      console.log('Public Key:', account.pubkey.toString());
      console.log('Data length:', account.account.data.length);
      
      // Try to read fleet label (around offset 105-137)
      try {
        const labelBytes = account.account.data.slice(105, 137);
        const label = labelBytes.toString('utf8').replace(/\0/g, '').trim();
        if (label) {
          console.log('Possible Fleet Name:', label);
        }
      } catch (e) {
        // Ignore
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('Error searching:', error.message);
  }
}

findRentedFleets();
