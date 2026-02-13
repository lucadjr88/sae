import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';

const profileId = '4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8';
const owner = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
const authority = '9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY';

async function test() {
  const connection = new Connection(clusterApiUrl('mainnet-beta'));
  const acc = await connection.getAccountInfo(new PublicKey(profileId));
  if (!acc) {
    console.log('Account not found');
    return;
  }
  console.log('Account found!');
  console.log('Owner:', acc.owner.toBase58());
  console.log('Data length:', acc.data.length);
  console.log('First 100 bytes (hex):', acc.data.slice(0, 100).toString('hex'));
  console.log('');
  console.log('Checking for owner/authority in data:');
  const ownerBuf = new PublicKey(owner).toBuffer();
  const authBuf = new PublicKey(authority).toBuffer();
  const ownerHex = ownerBuf.toString('hex');
  const authHex = authBuf.toString('hex');
  const dataHex = acc.data.toString('hex');
  console.log('Owner appears in data:', dataHex.includes(ownerHex));
  console.log('Authority appears in data:', dataHex.includes(authHex));
}

test().catch(console.error);
