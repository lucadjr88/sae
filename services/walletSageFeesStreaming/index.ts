// Orchestratore walletSageFeesStreaming
// API: getWalletSageFeesDetailedStreaming(services, walletPubkey, options)
// Usa solo funzioni pure da lib/, nessun side-effect

import { StreamingOptions, StreamingResult } from './types';
import { parseSageTransaction } from './lib/parsers';
// import { aggregateFees } from './lib/aggregator'; // to be implemented

// Dipendenze da iniettare: services.rpcPool, services.logger, services.metrics, OP_MAP, SAGE_PROGRAM_ID

export async function getWalletSageFeesDetailedStreaming(
  services: any,
  walletPubkey: string,
  options: StreamingOptions = {}
): Promise<StreamingResult> {
  // Esempio: fetch transazioni via services.rpcPool
  const { rpcPool, OP_MAP, SAGE_PROGRAM_ID } = services;
  // TODO: fetch transactions, parse, aggrega, return result
  // Qui solo stub, la logica va completata step by step

  // 1. Fetch transactions (mock)
  const transactions: any[] = []; // Da implementare: fetch reale

  // 2. Parse transactions
  const parsed = transactions.map(tx => parseSageTransaction(tx, OP_MAP, SAGE_PROGRAM_ID));

  // 3. Aggrega risultati (stub)
  // const summary = aggregateFees(parsed);
  const summary = {};

  return {
    summary,
    items: parsed,
    partial: false
  };
}
