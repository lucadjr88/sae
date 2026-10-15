const STORAGE_KEY = 'sea.localSigner.v1';
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 8;

const toBase64 = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const fromBase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// La chiave cifrata resta nel browser; in chiaro esiste solo in memoria dopo lo sblocco.
export class LocalSigner {
  constructor() {
    this.keypair = null;
  }

  get unlocked() {
    return this.keypair !== null;
  }

  get publicKey() {
    return this.keypair?.publicKey ?? null;
  }

  storedPublicKey() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY))?.publicKey ?? null;
    } catch {
      return null;
    }
  }

  async importKey(secretKeyText, password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password troppo corta (minimo ${MIN_PASSWORD_LENGTH} caratteri)`);
    }
    let secretKey;
    try {
      secretKey = Uint8Array.from(JSON.parse(secretKeyText));
    } catch {
      throw new Error('Formato chiave non valido: atteso array JSON, es. [82, 194, ...]');
    }
    if (secretKey.length !== 64) throw new Error('Chiave non valida: servono 64 byte');

    const { Keypair } = await import('@solana/web3.js');
    const keypair = Keypair.fromSecretKey(secretKey);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await deriveKey(password, salt),
      secretKey,
    ));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      publicKey: keypair.publicKey.toBase58(),
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(encrypted),
    }));
    this.keypair = keypair;
  }

  async unlock(password) {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      stored = null;
    }
    if (!stored) throw new Error('Nessuna chiave salvata');

    let secretKey;
    try {
      secretKey = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(stored.iv) },
        await deriveKey(password, fromBase64(stored.salt)),
        fromBase64(stored.ciphertext),
      ));
    } catch {
      throw new Error('Password errata');
    }
    const { Keypair } = await import('@solana/web3.js');
    this.keypair = Keypair.fromSecretKey(secretKey);
  }

  lock() {
    this.keypair = null;
  }

  forget() {
    localStorage.removeItem(STORAGE_KEY);
    this.lock();
  }

  sign(transaction) {
    if (!this.keypair) throw new Error('Firmatario locale bloccato');
    transaction.sign([this.keypair]);
    return transaction;
  }
}
