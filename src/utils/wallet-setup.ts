import { Keypair } from "@solana/web3.js";
import fs from 'fs';

/**
 * Loads a Keypair from a file
 * @param walletPath - the path to the wallet file
 * @returns the Keypair
 */
export function loadKeypair(walletPath: string): Keypair {
    const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}
