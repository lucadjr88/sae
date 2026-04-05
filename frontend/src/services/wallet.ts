

import { PublicKey } from '@solana/web3.js';
import { getWalletAdapters } from '@/services/wallet-adapter';




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

    private async refreshAdapters() {
        const adapters = await getWalletAdapters();
        this.adapters = adapters;
        this.walletInfos = adapters.map((adapter: any) => ({
            name: adapter.name || 'Wallet',
            icon: adapter.icon || '',
            detect: () => true
        }));
    }

    private async wait(ms: number) {
        await new Promise(resolve => window.setTimeout(resolve, ms));
    }

    async connect(maxAttempts = 3) {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.error = null;

        try {
            await this.refreshAdapters();

            // DESKTOP: mostra popup per selezione wallet
            const choice = await this.showWalletModal();
            if (choice === null) {
                this.isConnected = false;
                this.error = 'No wallet found.';
                //alert('No wallet found..');
                return;
            }

            let lastError = 'Connection failed';

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const adapter = this.adapters[choice];

                if (!adapter || typeof adapter.connect !== 'function') {
                    lastError = 'Adapter non trovato o non valido';
                    this.isConnected = false;
                    this.publicKey = null;
                    this.adapter = null;
                    this.error = lastError;

                    if (attempt < maxAttempts) {
                        console.warn(`[Wallet] Adapter non valido, retry ${attempt}/${maxAttempts}`);
                        await this.refreshAdapters();
                        await this.wait(250 * attempt);
                        continue;
                    }

                    //alert(`${lastError} (tentativo ${attempt}/${maxAttempts})`);
                    return;
                }

                try {
                    await adapter.connect();
                    this.isConnected = true;
                    this.publicKey = adapter.publicKey || null;
                    this.error = null;
                    this.selected = choice;
                    this.adapter = adapter;
                    return;
                } catch (e: any) {
                    lastError = e?.message || 'Connection failed';
                    this.isConnected = false;
                    this.publicKey = null;
                    this.adapter = null;
                    this.error = lastError;

                    if (attempt < maxAttempts) {
                        console.warn(`[Wallet] connect retry ${attempt}/${maxAttempts} fallito:`, e);
                        await this.wait(400 * attempt);
                        continue;
                    }

                    //alert('Error during connection: ' + lastError);
                }
            }
        } finally {
            this.isConnecting = false;
            window.dispatchEvent(new Event('walletStateChanged'));
            console.log("[Wallet] connect() completed with state:", { isConnected: this.isConnected, publicKey: this.publicKey, error: this.error });
        }
    }

    async disconnect() {
        if (this.selected !== null) {
            await this.adapters[this.selected].disconnect();
        }
        this.isConnected = false;
        this.publicKey = null;
        this.error = null;
        this.selected = null;
        this.adapter = null;
        window.dispatchEvent(new Event('walletStateChanged'));
        console.log("[Wallet] disconnect() completed with state:", { isConnected: this.isConnected, publicKey: this.publicKey, error: this.error });
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array | null> {
        if (!this.adapter?.connected) return null;
        try {
            const signature = await this.adapter.signMessage(message);
            return signature;
        } catch (e: any) {
            this.error = e.message || 'Sign failed';
            window.dispatchEvent(new Event('walletStateChanged'));
            console.log("[Wallet] signMessage() failed with state:", { isConnected: this.isConnected, publicKey: this.publicKey, error: this.error });
            return null;
        }
    }

    async showWalletModal(): Promise<number | null> {
        return new Promise((resolve) => {
            // Usa walletInfos invece di WALLET_ADAPTERS
            const detected = this.walletInfos.map((w, i) => ({ ...w, idx: i })).filter(w => w.detect && w.detect());
            let modal = document.getElementById('wallet-modal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'wallet-modal';
            modal.className = 'wallet-modal';
            let content = '';
            if (detected.length > 0) {
                content = detected.map(w =>
                    `<button data-wallet-idx="${w.idx}" class="wallet-modal-option">
                        <img src="${w.icon}" alt="${w.name}" class="wallet-modal-option-icon">${w.name}
                    </button>`
                ).join('');
            } else {
                content = `<div class="wallet-modal-empty">No wallet found</div>`;
            }
            modal.innerHTML = `
                <div id="wallet-modal-box" class="wallet-modal-box">
                    <div class="wallet-modal-title">Scegli il wallet</div>
                    ${content}
                </div>
            `;
            document.body.appendChild(modal);
            // Click su wallet
            modal.querySelectorAll('button[data-wallet-idx]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idxAttr = (btn as HTMLButtonElement).dataset.walletIdx;
                    const idx = typeof idxAttr === 'string' ? parseInt(idxAttr, 10) : NaN;
                    modal.remove();
                    resolve(Number.isNaN(idx) ? null : idx);
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
export const wallet = new Wallet();
(window as any).wallet = wallet;
