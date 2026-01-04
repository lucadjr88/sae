import { TransactionInfo } from '../types.js';
import { FeeAggregatorInput, FeeAggregatorOutput } from './interfaces.js';

/**
 * FeeAggregator - Modulo per aggregazione fee
 *
 * Responsabilità: Aggiornamento strutture dati fee per fleet e operazioni,
 * con gestione specializzata per crafting transactions e calcolo metriche.
 */
export async function aggregateFees(input: FeeAggregatorInput): Promise<FeeAggregatorOutput> {
  const { transaction, operation, involvedFleetName, craftingDetails, sageProgramId } = input;

  const feesByFleetUpdate: Record<string, any> = {};
  const feesByOperationUpdate: Record<string, any> = {};

  // Se non abbiamo un fleet coinvolto, non possiamo aggregare
  if (!involvedFleetName) {
    return { feesByFleetUpdate, feesByOperationUpdate };
  }

  const isCrafting = craftingDetails?.enhancedOperation?.includes('Crafting') ||
                     operation.includes('Crafting') ||
                     craftingDetails?.craftingAction !== undefined;

  // Determina l'opKey (raggruppa tutte le crafting sotto 'Crafting')
  const opKey = isCrafting ? 'Crafting' : operation;

  // Verifica se deve aggiungere questa transazione (special handling per Subwarp)
  const shouldAdd = shouldAddTransaction(transaction, opKey, sageProgramId);

  if (!shouldAdd) {
    return { feesByFleetUpdate, feesByOperationUpdate };
  }

  // Aggiorna feesByFleet
  if (!feesByFleetUpdate[involvedFleetName]) {
    feesByFleetUpdate[involvedFleetName] = {
      totalFee: 0,
      feePercentage: 0,
      totalOperations: 0,
      operations: {},
      isRented: false // Questo sarà impostato dal chiamante
    };
  }

  // Aggiorna totalFee per la fleet
  feesByFleetUpdate[involvedFleetName].totalFee += transaction.fee;

  // Inizializza operations entry se non esiste
  if (!feesByFleetUpdate[involvedFleetName].operations[opKey]) {
    feesByFleetUpdate[involvedFleetName].operations[opKey] = {
      count: 0,
      totalFee: 0,
      avgFee: 0,
      percentageOfFleet: 0,
      details: [] // Dettagli per unfold
    };
  }

  // Aggiorna contatori per l'operazione specifica
  const opData = feesByFleetUpdate[involvedFleetName].operations[opKey];
  opData.count++;
  opData.totalFee += transaction.fee;

  // Per crafting, salva dettagli aggiuntivi
  if (isCrafting && craftingDetails) {
    opData.details.push({
      action: craftingDetails.craftingAction,
      type: craftingDetails.craftingAction,
      displayType: craftingDetails.craftingMaterial || 'Crafting',
      fee: transaction.fee,
      material: craftingDetails.craftingMaterial,
      txid: transaction.signature,
      fleet: involvedFleetName,
      decodedKind: craftingDetails.decodedRecipe ? 'recipe' : undefined,
      decodedData: craftingDetails.decodedRecipe
    });
  }

  // Aggiorna feesByOperation
  if (!feesByOperationUpdate[opKey]) {
    feesByOperationUpdate[opKey] = {
      count: 0,
      totalFee: 0,
      avgFee: 0,
      details: []
    };
  }

  feesByOperationUpdate[opKey].count++;
  feesByOperationUpdate[opKey].totalFee += transaction.fee;

  // Per crafting, salva dettagli anche qui
  if (isCrafting && craftingDetails) {
    feesByOperationUpdate[opKey].details.push({
      action: craftingDetails.craftingAction,
      type: craftingDetails.craftingAction,
      displayType: craftingDetails.craftingMaterial || 'Crafting',
      fee: transaction.fee,
      material: craftingDetails.craftingMaterial,
      txid: transaction.signature,
      fleet: involvedFleetName,
      decodedKind: craftingDetails.decodedRecipe ? 'recipe' : undefined,
      decodedData: craftingDetails.decodedRecipe
    });
  }

  return { feesByFleetUpdate, feesByOperationUpdate };
}

/**
 * Determina se una transazione deve essere aggiunta all'aggregazione
 * Special handling per operazioni Subwarp che richiedono verifica nei logs
 */
function shouldAddTransaction(transaction: TransactionInfo, opKey: string, sageProgramId: string): boolean {
  if (opKey === 'Subwarp') {
    // Verifica che sia davvero subwarp guardando nei logs e istruzioni
    const logsLower = (transaction.logMessages || []).join(' ').toLowerCase();
    const instrLower = (transaction.instructions || []).join(' ').toLowerCase();
    return logsLower.includes('subwarp') || instrLower.includes('subwarp');
  }

  // Per tutte le altre operazioni, aggiungi sempre
  return true;
}