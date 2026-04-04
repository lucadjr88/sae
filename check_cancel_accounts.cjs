const { Connection, PublicKey } = require('./node_modules/@solana/web3.js');

(async () => {
  const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const keys = {
    c1: 'DD6j1K2MyRhhrLjQs83vA3w7WqzdN3QwMyMpqHnENHUu',
    r1: '4PPZCiLqrR37WhGfW7UhEXhzXEnfa5TQjar8exWB3LRk',
    c2: 'Cn8bEiQhTFZLG7kKHHNK544MrXGQAtqqM6CsDZJBi638',
    r2: '9GnWLywLDvaT8xR85ejC5xL1Hkm4MGNV9SkD2NgnQhC5',
  };
  for (const [name, key] of Object.entries(keys)) {
    const info = await conn.getAccountInfo(new PublicKey(key), 'confirmed');
    console.log(name, {
      exists: !!info,
      owner: info?.owner?.toBase58?.() || null,
      lamports: info?.lamports ?? null,
      dataLen: info?.data?.length ?? null,
    });
  }
})();
