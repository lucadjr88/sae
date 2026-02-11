import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { decodeInstructions } from '../../decoders/decodeInstructions';
import { saveSageOpsToCache } from '../../utils/saveSageOpsToCache';
import { enrichFleetStateHandler } from '../../decoders/fleetstatehandler';

// GET /api/debug/decode-sage-ops-full?profileId=...
export async function decodeSageOpsFullHandler(req: Request, res: Response) {
  const profileId = req.query.profileId as string;
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  try {
    const walletTxsDir = path.join(process.cwd(), 'cache', profileId, 'wallet-txs');
    const walletDirs = await fs.readdir(walletTxsDir);
    let allTxs: any[] = [];
    for (const wallet of walletDirs) {
      const walletDir = path.join(walletTxsDir, wallet);
      let files: string[] = [];
      try {
        files = await fs.readdir(walletDir);
      } catch { continue; }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(walletDir, file), 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.data) allTxs.push({ raw: parsed.data, norm: parsed.data });
        } catch {}
      }
    }
    const decoded = decodeInstructions(allTxs);
    
    // ARRICCHIMENTO: Applica enrichment a FleetStateHandler
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
      
      //console.log(`[FleetStateHandler Enrichment] Found FleetStateHandler with logMessages, enriching...`);
      
      // Arricchire il FleetStateHandler
      const enrichment = enrichFleetStateHandler(
        decodedOp.name,
        op.txInfo.logMessages,
        op.signature,
        op.txInfo.blockTime
      );
      
      //console.log(`[FleetStateHandler Enrichment] Enriched: ${enrichment.originalName} → ${enrichment.enrichedName} (${enrichment.stateType})`);
      
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
    
    const sageOps = enriched.filter(op => op.success && op.instructionName !== 'Unknown');
    const unknown = enriched.filter(op => !op.success || op.instructionName === 'Unknown');
    await saveSageOpsToCache(profileId, sageOps);
    if (unknown.length > 0) {
      const { saveUnknownOps } = await import('../saveUnknownOps');
      await saveUnknownOps(profileId, unknown);
    }
    const total = sageOps.length + unknown.length;
    console.log(`[API] decode-sage-ops-full: profileId=${profileId} totale tx=${total}, sageOps=${sageOps.length}, unknown=${unknown.length}`);
    return res.json({ sageOps, unknown });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'decodeSageOpsFull failed' });
  }
}
