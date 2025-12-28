import { TransactionInfo } from '../types.js';
import { ResultBuilderInput, ResultBuilderOutput } from './interfaces.js';

/**
 * ResultBuilder - Modulo per costruzione risultato finale
 *
 * Responsabilità: Costruzione del risultato finale con ordinamento,
 * calcolo percentuali e formattazione per API response.
 */
export async function buildFinalResult(input: ResultBuilderInput): Promise<ResultBuilderOutput> {
  const {
    context,
    allTransactions,
    totalSignaturesFetched,
    mergedTransactions,
    walletPubkey,
    hours
  } = input;

  // Ordina transazioni per timestamp decrescente (più recenti prima)
  const sortedTransactions = [...mergedTransactions].sort(
    (a, b) => (b.blockTime || 0) - (a.blockTime || 0)
  );

  // Calcola transaction count SAGE
  const transactionCount24h = sortedTransactions.filter(
    tx => tx.programIds && tx.programIds.includes(context.constants.SAGE_PROGRAM_ID)
  ).length;

  // Costruisci risultato finale
  const finalResult: ResultBuilderOutput = {
    type: 'complete',
    walletAddress: walletPubkey,
    period: `Last ${hours} hours`,
    totalFees24h: context.totalFees24h,
    sageFees24h: context.sageFees24h,
    transactionCount24h,
    totalSignaturesFetched,
    feesByFleet: context.feesByFleet,
    feesByOperation: context.feesByOperation,
    transactions: sortedTransactions,
    unknownOperations: context.unknownOperations,
    rentedFleetAccounts: Array.from(context.rentedFleets),
    fleetAccountNamesEcho: context.config.fleetAccountNames,
    fleetRentalStatusFinal: context.config.fleetRentalStatus || {}
  };

  return finalResult;
}