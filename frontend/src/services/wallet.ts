

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

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.error = null;

        if (this.adapters.length === 0) {
            const adapters = await getWalletAdapters();
            this.adapters = adapters;
            this.walletInfos = adapters.map((adapter: any) => ({
                name: adapter.name || 'Wallet',
                icon: adapter.icon || '',
                detect: () => true
            }));
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
        }
        window.dispatchEvent(new Event('walletStateChanged'));
        console.log("[Wallet] connect() completed with state:", { isConnected: this.isConnected, publicKey: this.publicKey, error: this.error });
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
export const wallet = new Wallet();
(window as any).wallet = wallet;
