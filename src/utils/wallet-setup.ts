import { readFileSync } from 'fs';
import { Keypair, PublicKey } from '@solana/web3.js';

// For production, we'll use a dummy wallet for read-only operations
export const getWallet = (): Keypair => {
  // In a real application, you would load your keypair from a file
  // For this read-only explorer, we create a dummy keypair
  return Keypair.generate();
};

// Helper function to create PublicKey from string
export const getPublicKey = (address: string): PublicKey => {
  return new PublicKey(address);
};

// Game and mint addresses - corrected addresses
export const GAME_ID = new PublicKey('SAGEaQ6yoNaWH1EAqiANWMdKZgLYVo1yMJ1z7JGRRFr'); // Using SAGE program ID as game reference
export const ATLAS_MINT = new PublicKey('ATLASXmbPQxBUYbVuYw6ppwNZ6dn5JKLQEXGXY94DFZ');
export const POLIS_MINT = new PublicKey('poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk');