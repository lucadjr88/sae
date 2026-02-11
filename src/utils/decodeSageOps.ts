// Decodifica tutte le SAGE ops tra le tx (stub)
import { getCachedWalletTxs } from './getCachedWalletTxs';
import { decodeInstructions } from '../decoders/decodeInstructions';
import { saveSageOpsToCache } from './saveSageOpsToCache';
import { enrichFleetStateHandler } from '../decoders/fleetstatehandler';

// Decodifica tutte le SAGE ops tra le tx reali di un wallet
export async function decodeSageOpsUtil(wallet: string, lats: number, profileId?: string): Promise<{sageOps: any[], unknown: any[]}> {
  // Step 1: Leggi le tx dalla cache locale (CONTIENE GIÀ logMessages)
  const txs = await getCachedWalletTxs(wallet, profileId || wallet);
  
  // Step 2: Decodifica
  const decoded = decodeInstructions(txs);
  
  // Step 3: ARRICCHIMENTO - Subito dopo il decode
  const enriched = decoded.map(op => {
    // Se non è un'operazione SAGE o non ha decoded, ritorna com'è
    if (op.instructionName !== 'SAGE_OP' || !op.decoded || !Array.isArray(op.decoded) || op.decoded.length === 0) {
      return op;
    }
    
    const decodedOp = op.decoded[0];
    
    // Se non è FleetStateHandler o non ha logMessages, ritorna com'è
    if (decodedOp?.name !== 'FleetStateHandler' || !op.txInfo?.logMessages) {
      return op;
    }
    
    // Arricchire il FleetStateHandler
    const enrichment = enrichFleetStateHandler(
      decodedOp.name,
      op.txInfo.logMessages,
      op.signature,
      op.txInfo.blockTime
    );
    
    // Modificare il nome e aggiungere metadati
    return {
      ...op,
      decoded: [{
        ...decodedOp,
        name: enrichment.enrichedName,
        originalName: enrichment.originalName,
        stateType: enrichment.stateType,
        stateDetails: enrichment.stateData
      }],
      instructionName: enrichment.enrichedName
    };
  });
  
  // Step 4: Separa SAGE ops (success true, instructionName != 'Unknown') e unknown
  const sageOps = enriched.filter(op => op.success && op.instructionName !== 'Unknown');
  const unknown = enriched.filter(op => !op.success || op.instructionName === 'Unknown');
  
  // Step 5: Salva ogni SAGE op nella cache sotto <profileid>/sage-ops/ usando la signature
  await saveSageOpsToCache(profileId || wallet, sageOps);
  
  return { sageOps, unknown };
}
