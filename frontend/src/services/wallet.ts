

import { PublicKey } from '@solana/web3.js';
import { getWalletAdapters } from './wallet-adapter';




export class Wallet {
    isConnected = false;
    isConnecting = false;
    publicKey: PublicKey | null = null;
    error: string | null = null;
    adapter: any = null;
    adapters: any[] = [];
    walletInfos: any[] = [];
    selected: number | null = null;

    constructor() {
        // Non caricare più gli adapter qui: lo farà connect()
    }

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.error = null;
        window.dispatchEvent(new Event('walletStateChanged'));

        if (this.adapters.length === 0) {
            const adapters = await getWalletAdapters();
            this.adapters = adapters;
            this.walletInfos = adapters.map((adapter: any) => ({
                name: adapter.name || 'Wallet',
                icon: adapter.icon || '',
                detect: () => true
            }));
        }

        // MOBILE: Solana Mobile Wallet Adapter pattern fedele agli esempi ufficiali
        if (this.adapters.length === 1 && this.adapters[0].name === 'Solana Mobile Wallet') {
            // La connessione avviene tramite callback/handler asincrono
            try {
                const result = await this.adapters[0].connect();
                console.log('[MOBILE WALLET] connect() result:', result);
                let pubkey = null;
                if (result && result.publicKey) {
                    pubkey = result.publicKey;
                    console.log('[MOBILE WALLET] publicKey (result.publicKey):', pubkey);
                } else if (result && result.accounts && result.accounts[0] && result.accounts[0].publicKey) {
                    pubkey = result.accounts[0].publicKey;
                    console.log('[MOBILE WALLET] publicKey (result.accounts[0].publicKey):', pubkey);
                } else {
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
        }

        // DESKTOP: mostra popup per selezione wallet
        const choice = await this.showWalletModal();
        if (choice === null) {
            this.isConnecting = false;
            this.error = 'No wallet found.';
            window.dispatchEvent(new Event('walletStateChanged'));
            alert('No wallet found..');
            return;
        }
        try {
            await this.adapters[choice].connect();
            this.isConnected = true;
            this.publicKey = this.adapters[choice].publicKey || null;
            this.error = null;
            this.selected = choice;
            this.adapter = this.adapters[choice];
        } catch (e: any) {
            this.isConnected = false;
            this.publicKey = null;
            this.error = e.message || 'Connection failed';
            alert('Error during connection: ' + (e.message || e));
        } finally {
            this.isConnecting = false;
            window.dispatchEvent(new Event('walletStateChanged'));
        }
    }

    async disconnect() {
        if (this.selected !== null) {
            await this.adapters[this.selected].disconnect();
        }
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array | null> {
        if (!this.adapter?.connected) return null;
        try {
            const signature = await this.adapter.signMessage(message);
            return signature;
        } catch (e: any) {
            this.error = e.message || 'Sign failed';
            window.dispatchEvent(new Event('walletStateChanged'));
            return null;
        }
    }

    async showWalletModal(): Promise<number|null> {
        return new Promise((resolve) => {
            // Usa walletInfos invece di WALLET_ADAPTERS
            const detected = this.walletInfos.map((w, i) => ({...w, idx: i})).filter(w => w.detect && w.detect());
            let modal = document.getElementById('wallet-modal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'wallet-modal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.background = 'rgba(0,0,0,0.6)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
            let content = '';
            if (detected.length > 0) {
                content = detected.map(w =>
                    `<button data-wallet-idx="${w.idx}" style="display:flex;align-items:center;gap:10px;width:100%;margin:0.5em 0;padding:0.7em 1em;font-size:1em;border-radius:8px;background:#222;color:#fff;border:none;cursor:pointer;">
                        <img src="${w.icon}" alt="${w.name}" style="width:28px;height:28px;vertical-align:middle;object-fit:contain;">${w.name}
                    </button>`
                ).join('');
            } else {
                content = `<div style="color:#f87171;font-size:1.1em;margin-bottom:1em;">No wallet found</div>`;
            }
            modal.innerHTML = `
                <div id="wallet-modal-box" style="background:#181c24;padding:2em 1.5em;border-radius:16px;min-width:220px;box-shadow:0 2px 16px #0008;text-align:center;">
                    <div style="font-size:1.2em;margin-bottom:1em;">Scegli il wallet</div>
                    ${content}
                </div>
            `;
            document.body.appendChild(modal);
            // Click su wallet
            modal.querySelectorAll('button[data-wallet-idx]').forEach(btn => {
                btn.addEventListener('click', (e: any) => {
                    const idx = parseInt(e.target.getAttribute('data-wallet-idx'), 10);
                    modal.remove();
                    resolve(idx);
                });
            });
            // Chiudi cliccando fuori dal box
            modal.addEventListener('mousedown', (e: MouseEvent) => {
                const box = document.getElementById('wallet-modal-box');
                if (box && !box.contains(e.target as Node)) {
                    modal.remove();
                    resolve(null);
                }
            });
        });
    }
}

(window as any).wallet = new Wallet();
