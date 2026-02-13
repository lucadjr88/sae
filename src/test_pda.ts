import { PublicKey } from '@solana/web3.js';

const owner = 'GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv';
const authority = '9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY';
const actualProfileId = '4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8';
const programId = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';

async function test() {
  const [pda1] = await PublicKey.findProgramAddress(
    [Buffer.from('profile'), new PublicKey(authority).toBuffer()],
    new PublicKey(programId)
  );
  console.log('From authority:', pda1.toBase58());
  console.log('Matches actual?', pda1.toBase58() === actualProfileId);

  const [pda2] = await PublicKey.findProgramAddress(
    [Buffer.from('profile'), new PublicKey(owner).toBuffer()],
    new PublicKey(programId)
  );
  console.log('From owner:', pda2.toBase58());
  console.log('Matches actual?', pda2.toBase58() === actualProfileId);
}

test();
