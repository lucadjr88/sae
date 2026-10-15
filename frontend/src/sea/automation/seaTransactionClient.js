const prepareEndpoints = {
  scan: '/api/sea/scan/prepare',
  subwarp_start: '/api/sea/subwarp/prepare',
  warp_start: '/api/sea/warp/prepare',
  subwarp_exit: '/api/sea/movement/exit/prepare',
  warp_exit: '/api/sea/movement/exit/prepare',
};

export class SeaTransactionClient {
  constructor(wallet, fetchImpl = fetch) {
    this.wallet = wallet;
    this.fetch = fetchImpl.bind(globalThis);
  }

  async walletAddress() {
    if (!this.wallet?.isConnected) await this.wallet?.connect();
    const address = this.wallet?.publicKey?.toString();
    if (!address) throw new Error('Wallet browser non collegato');
    return address;
  }

  async prepareAction({ profileId, fleetId, destination, action, starbase, feeMode = 'sly', priorityFeeLamports = 1 }) {
    const endpoint = prepareEndpoints[action];
    if (!endpoint) throw new Error('Azione Sea non supportata');

    const requestBody = {
      profileId,
      fleetId,
      wallet: await this.walletAddress(),
      coordinates: [destination.x, destination.y],
      feeMode,
      priorityFeeLamports,
    };
    if (action === 'subwarp_start' || action === 'warp_start') requestBody.starbase = starbase;

    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || result.error || `HTTP ${response.status}`);
    return { ...result, action: result.action ?? action };
  }

  async signAndSubmit({ prepareId, profileId, transaction }) {
    const wallet = await this.walletAddress();
    const { VersionedTransaction } = await import('@solana/web3.js');
    const transactionBytes = Uint8Array.from(atob(transaction), character => character.charCodeAt(0));
    const unsigned = VersionedTransaction.deserialize(transactionBytes);
    const signed = await this.wallet.adapter.signTransaction(unsigned);
    const signedBytes = signed.serialize();
    const signedBase64 = btoa(Array.from(signedBytes, byte => String.fromCharCode(byte)).join(''));
    const response = await this.fetch('/api/sea/scan/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prepareId, profileId, wallet, transaction: signedBase64 }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || result.error || `HTTP ${response.status}`);
    return result;
  }
}