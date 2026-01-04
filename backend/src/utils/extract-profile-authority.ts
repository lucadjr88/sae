import { PublicKey } from "@solana/web3.js";

/**
 * Estrae la wallet authority dai dati binari di un account profilo Star Atlas.
 * @param profileData Buffer o Uint8Array contenente i dati raw dell'account profilo
 * @returns stringa base58 della public key dell'authority, oppure null se dati insufficienti
 */
export function extractProfileAuthority(profileData: Buffer | Uint8Array): string | null {
  if (!profileData || profileData.length < 43) return null;
  const authorityBytes = profileData.slice(11, 43);
  try {
    return new PublicKey(authorityBytes).toString();
  } catch {
    return null;
  }
}
