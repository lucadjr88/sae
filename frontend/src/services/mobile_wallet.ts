// src/services/mobile_wallet.ts
import { transact, Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import bs58 from "bs58";

// Stato locale del modulo
let session: any = null;
let publicKey: string | null = null;
let isConnected = false;
let connectCallbacks: Array<(pubkey: string) => void> = [];
let disconnectCallbacks: Array<() => void> = [];

export function initializeMobileWallet() {
  session = null;
  publicKey = null;
  isConnected = false;
  connectCallbacks = [];
  disconnectCallbacks = [];
}

export async function connectMobileWallet() {
  try {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      return await wallet.authorize({
        chain: "solana:mainnet",
        identity: {
          name: "Star Atlas Explorer",
          uri: "https://staratlasexplorer.duckdns.org",
          icon: "favicon.ico",
        },
      });
    });
    session = result;
    // Gestione publicKey: base58 o base64
    let pubkey: string | null = null;
    if (result && result.accounts && result.accounts[0] && result.accounts[0].address) {
      // base64 → base58
      const base64 = result.accounts[0].address;
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      pubkey = bs58.encode(bytes);
    }
    publicKey = pubkey;
    isConnected = !!pubkey;
    if (isConnected && pubkey) {
      connectCallbacks.forEach(cb => cb(pubkey));
    }
    return pubkey;
  } catch (err) {
    isConnected = false;
    publicKey = null;
    session = null;
    throw err;
  }
}

export function getMobilePublicKey(): string | null {
  return publicKey;
}

export function isMobileSessionValid(): boolean {
  // Sessione valida se publicKey presente
  return !!publicKey;
}

export function onMobileConnect(cb: (pubkey: string) => void) {
  connectCallbacks.push(cb);
}

export function onMobileDisconnect(cb: () => void) {
  disconnectCallbacks.push(cb);
}

export async function disconnectMobileWallet() {
  // Dummy: Solana Mobile Adapter non ha disconnect reale, ma resetta lo stato
  session = null;
  publicKey = null;
  isConnected = false;
  disconnectCallbacks.forEach(cb => cb());
}

// VECCHIO CODICE (src/services/wallet.ts) - NON USARE, SOLO PER CONFRONTO
/*
        // MOBILE: Solana Mobile Wallet Adapter pattern fedele agli esempi ufficiali
        if (this.adapters.length === 1 && this.adapters[0].name === 'Solana Mobile Wallet') {
            // La connessione avviene tramite callback/handler asincrono
            try {
                const result = await this.adapters[0].connect();
                console.log('[MOBILE WALLET] connect() result:', result);
                let pubkey = null;
                // Caso 1: publicKey base58
                if (result && result.publicKey) {
                    pubkey = result.publicKey;
                    console.log('[MOBILE WALLET] publicKey (result.publicKey, base58):', pubkey);
                }
                // Caso 2: publicKey in accounts[0].publicKey (base58)
                else if (result && result.accounts && result.accounts[0] && result.accounts[0].publicKey) {
                    pubkey = result.accounts[0].publicKey;
                    console.log('[MOBILE WALLET] publicKey (result.accounts[0].publicKey, base58):', pubkey);
                }
                // Caso 3: address in accounts[0].address (base64)
                else if (result && result.accounts && result.accounts[0] && result.accounts[0].address) {
                    // Converti base64 → Uint8Array → base58
                    try {
                        const base64 = result.accounts[0].address;
                        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                        // Importa dinamicamente bs58 per compatibilità
                        const bs58 = (await import('bs58')).default;
                        pubkey = bs58.encode(bytes);
                        console.log('[MOBILE WALLET] publicKey (result.accounts[0].address, base64→base58):', pubkey);
                    } catch (err) {
                        console.error('[MOBILE WALLET] Errore conversione base64→base58:', err);
                    }
                }
                else {
                    console.warn('[MOBILE WALLET] Nessuna publicKey trovata nel risultato:', result);
                }
                if (pubkey) {
                    this.isConnected = true;
                    this.publicKey = pubkey;
                    this.selected = 0;
                    this.adapter = this.adapters[0];
                    this.error = null;
                    console.log('[MOBILE WALLET] Connessione riuscita, publicKey:', pubkey);
                } else {
                    this.isConnected = false;
                    this.publicKey = null;
                    this.error = 'No publicKey returned by wallet.';
                    console.error('[MOBILE WALLET] Connessione fallita, nessuna publicKey.');
                }
            } catch (e: any) {
                this.isConnected = false;
                this.publicKey = null;
                this.error = e.message || 'Connection failed';
                alert('Error during connection: ' + (e.message || e));
                console.error('[MOBILE WALLET] Errore durante la connessione:', e);
            } finally {
                this.isConnecting = false;
                window.dispatchEvent(new Event('walletStateChanged'));
                console.log('[MOBILE WALLET] Stato connessione aggiornato, isConnected:', this.isConnected);
            }
            return;
        }*/
