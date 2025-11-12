import { AnchorProvider, Program, Wallet } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Create connection
export const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

// Create a dummy keypair for read-only operations
const dummyKeypair = Keypair.generate();

// Create a simple wallet implementation
class SimpleWallet implements Wallet {
  constructor(public payer: Keypair) {}

  async signTransaction(tx: any) {
    tx.partialSign(this.payer);
    return tx;
  }

  async signAllTransactions(txs: any[]) {
    return txs.map((t) => {
      t.partialSign(this.payer);
      return t;
    });
  }

  get publicKey() {
    return this.payer.publicKey;
  }
}

const wallet = new SimpleWallet(dummyKeypair);

// Create provider
export const provider = new AnchorProvider(
  connection,
  wallet,
  AnchorProvider.defaultOptions()
);

export { wallet };