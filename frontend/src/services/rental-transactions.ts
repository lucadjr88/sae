import type { Transaction } from '@solana/web3.js';

export interface TransactionSigningAdapter {
  signTransaction(transaction: Transaction): Promise<Transaction>;
}

interface WalletForTransaction {
  adapter?: TransactionSigningAdapter | null;
  connect?: () => Promise<unknown>;
}

export async function resolveTransactionSigner(
  getWallet: () => WalletForTransaction | null | undefined,
  connectIfMissing: boolean,
  onMissing?: () => void,
): Promise<TransactionSigningAdapter | null> {
  let wallet = getWallet();
  if (!wallet?.adapter || typeof wallet.adapter.signTransaction !== 'function') {
    onMissing?.();
    if (connectIfMissing) await wallet?.connect?.();
    wallet = getWallet();
  }
  return wallet?.adapter && typeof wallet.adapter.signTransaction === 'function' ? wallet.adapter : null;
}

export async function decodeRentalTransaction(base64: string): Promise<Transaction> {
  const { Transaction } = await import('@solana/web3.js');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return Transaction.from(bytes);
}

export function encodeRentalTransaction(transaction: Transaction): string {
  return btoa(String.fromCharCode(...transaction.serialize()));
}

export function sendSignedRentalTransaction(body: {
  transaction: string;
  signingRequestId: string;
  contractAddress?: string;
  rentalState?: string;
  rentalCacheSeed?: unknown;
  txMeta?: Record<string, unknown>;
}): Promise<Response> {
  return fetch('/api/send-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
