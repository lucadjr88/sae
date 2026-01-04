// Modulo per fetch delle firme wallet con rate limiting
// Estrae la logica di recupero signatures dalla funzione monolitica

import { TransactionInfo } from '../types.js';
import { getAccountTransactions } from '../account-transactions.js';
import {
  SignatureFetcherInput,
  SignatureFetcherOutput
} from './interfaces.js';

/**
 * Fetch firme wallet per analisi fee streaming
 * Gestisce recupero signatures con rate limiting e aggiornamenti progress
 */
export async function fetchWalletSignatures(
  input: SignatureFetcherInput,
  sendUpdate: (data: any) => void
): Promise<SignatureFetcherOutput> {
  const {
    walletPubkey,
    hours,
    cutoffTime,
    maxTransactions,
    rpcEndpoint,
    rpcWebsocket
  } = input;

  // === PROGRESS UPDATE: INIZIO FETCH ===
  sendUpdate({
    type: 'progress',
    stage: 'signatures',
    message: 'Fetching signatures...',
    processed: 0,
    total: 0
  });

  // === FETCH FIRME ===
  // Chiama la funzione esistente getAccountTransactions che gestisce
  // internamente rate limiting, paginazione e retry
  const result = await getAccountTransactions(
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    maxTransactions,        // limit
    cutoffTime,            // sinceUnixMs
    maxTransactions,       // maxSignatures
    undefined              // opts (nessuna opzione speciale)
  );

  const allTransactions: TransactionInfo[] = result.transactions;
  const totalSignaturesFetched: number = result.totalSignaturesFetched;

  // === PROGRESS UPDATE: COMPLETATO ===
  sendUpdate({
    type: 'progress',
    stage: 'signatures',
    message: `Found ${totalSignaturesFetched} signatures`,
    processed: totalSignaturesFetched,
    total: totalSignaturesFetched
  });

  return {
    allTransactions,
    totalSignaturesFetched
  };
}