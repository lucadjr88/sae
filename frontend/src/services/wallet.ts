
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { PublicKey } from '@solana/web3.js';


const WALLET_ADAPTERS = [
    { name: 'Phantom', Adapter: PhantomWalletAdapter, icon: 'https://mintcdn.com/phantom-e50e2e68/fkWrmnMWhjoXSGZ9/resources/images/Phantom_SVG_Icon.svg?w=1100&fit=max&auto=format&n=fkWrmnMWhjoXSGZ9&q=85&s=d9602893116f9314145e2a303d675ccc', detect: () => window.solana && window.solana.isPhantom },
    { name: 'Solflare', Adapter: SolflareWalletAdapter, icon: 'https://www.solflare.com/wp-content/uploads/2024/11/App-Icon.svg', detect: () => window.solflare },
    { name: 'Backpack', Adapter: BackpackWalletAdapter, icon: 'https://lh3.googleusercontent.com/YQnjQjJ6NuY_rxRwy8JA177ONpmPiOdFpud8zK-ebcS8-r3mQzwrzmqlueLSvKw1SsaoeBYua7XePZ632xXM4aHUzw=s60', detect: () => window.backpack },
];

export class Wallet {
    isConnected = false;
    isConnecting = false;
    publicKey: PublicKey | null = null;
    error: string | null = null;
    adapter: any = null;
    adapters: any[] = [];
    selected: number | null = null;

    constructor() {
        this.adapters = WALLET_ADAPTERS.map(({ Adapter }) => new Adapter());
        // Listen to all adapters
        this.adapters.forEach((adapter, idx) => {
            adapter.on('connect', () => {
                this.isConnected = true;
                this.isConnecting = false;
                this.publicKey = adapter.publicKey;
                this.error = null;
                this.selected = idx;
                this.adapter = adapter;
                window.dispatchEvent(new Event('walletStateChanged'));
            });
            adapter.on('disconnect', () => {
                this.isConnected = false;
                this.publicKey = null;
                this.selected = null;
                this.adapter = null;
                window.dispatchEvent(new Event('walletStateChanged'));
            });
            adapter.on('error', (err: any) => {
                this.error = err.message || 'Wallet error';
                this.isConnecting = false;
                window.dispatchEvent(new Event('walletStateChanged'));
            });
        });
    }

    async connect() {
        this.isConnecting = true;
        window.dispatchEvent(new Event('walletStateChanged'));
        // Mostra popup minimale per selezione wallet
        const choice = await this.showWalletModal();
        if (choice === null) {
            this.isConnecting = false;
            this.error = 'Nessun wallet rilevato. Installa un wallet Solana compatibile.';
            window.dispatchEvent(new Event('walletStateChanged'));
            alert('Nessun wallet rilevato. Installa un wallet Solana compatibile.');
            return;
        }
        try {
            await this.adapters[choice].connect();
        } catch (e: any) {
            this.error = e.message || 'Connection failed';
            this.isConnecting = false;
            window.dispatchEvent(new Event('walletStateChanged'));
            alert('Errore durante la connessione: ' + (e.message || e));
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
            // Rileva solo wallet disponibili
            const detected = WALLET_ADAPTERS.map((w, i) => ({...w, idx: i})).filter(w => w.detect && w.detect());
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
                content = `<div style="color:#f87171;font-size:1.1em;margin-bottom:1em;">Nessun wallet rilevato</div>`;
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
