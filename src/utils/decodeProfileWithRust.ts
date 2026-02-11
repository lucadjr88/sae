// Utility per decodifica profilo Star Atlas con Rust
// Usa decodeAccountWithRust da sae/decoders/rust-wrapper.ts
// (Stub: la fetch reale va integrata con @solana/web3.js)

export async function decodeProfileWithRustUtil(profileId: string, fetchAccountInfo: (profileId: string) => Promise<Buffer | null>) {
  if (!profileId) throw new Error('Missing profileId');
  const buf = await fetchAccountInfo(profileId);
  if (!buf) throw new Error('No account data');
  // Import dinamico per evitare problemi di dipendenze
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { decodeAccountWithRust } = require('../../../../sae/decoders/rust-wrapper.ts');
  const parsed = decodeAccountWithRust(buf);
  // Estrai chiavi profilo se presenti
  let keys = null;
  try {
    const data = parsed?.data || parsed?.Profile || parsed?.profile || null;
    keys = data?.profile_keys || data?.profileKeys || data?.keys || null;
  } catch {}
  return { parsed, keys };
}
