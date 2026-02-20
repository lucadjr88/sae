// Minimal wallet module for frontend SAE
// (da estendere con provider reali)

export class Wallet {
  isConnected = false;
  isConnecting = false;
  publicKey = null;
  error = null;

  async connect() {
    this.isConnecting = true;
    // TODO: integra provider reale (es. Phantom)
    // Simulazione demo
    setTimeout(() => {
      this.isConnected = true;
      this.isConnecting = false;
      this.publicKey = 'DemoWalletPubkey123';
      this.error = null;
      window.dispatchEvent(new CustomEvent('walletStateChanged'));
    }, 1200);
  }

  async disconnect() {
    this.isConnected = false;
    this.publicKey = null;
    window.dispatchEvent(new CustomEvent('walletStateChanged'));
  }

  async signMessage(msg) {
    // TODO: implementa firma reale
    return 'signed-demo';
  }
}

declare global {
  interface Window {
    wallet: Wallet;
  }
}
window.wallet = new Wallet();
