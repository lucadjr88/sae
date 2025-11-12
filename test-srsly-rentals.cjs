const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a';
const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';

// User context
const PLAYER_PROFILE = 'AAozfxCznAp5WNMFYd5medXuTh3MKM3u3LXBufhc1nhi';
const BORROWED_FLEETS = [
  'GNofosk53LVzcAz51f7p1XWPkpBnv1bGybNJeUrciZfE', // Atlantic Cod Fleet
  'Bf4frq5oyagGBNH621SA6ShMoLeCnd3iEWXw7zTAwp2z', // Donkey Fleet
  'Ex9BtiHnu2fjznTyDY5xwR11dW54Hy6j9NpGfU4AhREU'  // mining Fleet
];

function bufferIncludes(haystack, needle) {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

(async () => {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const programKey = new PublicKey(SRSLY_PROGRAM_ID);
  const borrowerKey = new PublicKey(PLAYER_PROFILE);
  const borrowerBytes = borrowerKey.toBytes();
  const fleetBytes = BORROWED_FLEETS.map(f => new PublicKey(f).toBytes());

  console.log('Scanning SRSLY rental program accounts...');
  const accounts = await connection.getProgramAccounts(programKey);
  console.log('Total SRSLY accounts:', accounts.length);

  let matches = [];
  for (const { pubkey, account } of accounts) {
    const data = account.data;
    if (!data || data.length < 100) continue;

    // Heuristic 1: contains borrower profile bytes
    const borrowerOffset = bufferIncludes(data, borrowerBytes);

    // Heuristic 2: contains any fleet key bytes
    let fleetIndex = -1;
    let fleetOffset = -1;
    for (let i = 0; i < fleetBytes.length; i++) {
      const off = bufferIncludes(data, fleetBytes[i]);
      if (off !== -1) { fleetIndex = i; fleetOffset = off; break; }
    }

    if (borrowerOffset !== -1 || fleetIndex !== -1) {
      matches.push({
        pubkey: pubkey.toString(),
        dataLen: data.length,
        borrowerOffset,
        fleetOffset,
        fleetMatched: fleetIndex !== -1 ? BORROWED_FLEETS[fleetIndex] : null
      });
    }
  }

  console.log(`Found ${matches.length} SRSLY accounts related to your profile or fleets`);
  for (const m of matches.slice(0, 10)) {
    console.log('---');
    console.log('Account:', m.pubkey);
    console.log('Data len:', m.dataLen);
    console.log('BorrowerOffset:', m.borrowerOffset);
    console.log('FleetOffset:', m.fleetOffset, 'Fleet:', m.fleetMatched);
  }
})();
