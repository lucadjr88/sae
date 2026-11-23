import fs from 'fs/promises';
import path from 'path';
import { decodeInstructions } from '../decoders/decodeInstructions.js';
import { enrichFleetStateHandler } from '../decoders/fleetstatehandler.js';
import { saveSageOpsToCache } from '../utils/saveSageOpsToCache.js';
import { saveUnknownOps } from './saveUnknownOps.js';

export async function decodeCachedSageOps(profileId: string, walletSignatures?: Record<string, string[]>) {
  const walletTxsDir = path.join(process.cwd(), 'cache', profileId, 'wallet-txs');
  const walletDirs = walletSignatures ? Object.keys(walletSignatures) : await fs.readdir(walletTxsDir);
  const allTxs: any[] = [];
  for (const wallet of walletDirs) {
    const walletDir = path.join(walletTxsDir, wallet);
    let files: string[] = [];
    if (walletSignatures) files = walletSignatures[wallet].map(signature => `${signature}.json`);
    else {
      try {
        files = await fs.readdir(walletDir);
      } catch (error) {
        console.warn(`[decode-sage-ops-full] Failed to read wallet directory ${walletDir}:`, error);
        continue;
      }
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(walletDir, file), 'utf8');
        const parsed = JSON.parse(raw);
        if (walletSignatures && (parsed?.data?.signature !== file.slice(0, -5) ||
            typeof parsed?.data?.slot !== 'number' || !parsed?.data?.transaction?.message)) {
          throw new Error(`Invalid cached transaction ${file}`);
        }
        if (parsed && parsed.data) allTxs.push({ raw: parsed.data, norm: parsed.data });
      } catch (error) {
        if (walletSignatures) throw error;
        console.warn(`[decode-sage-ops-full] Failed to read cached transaction ${path.join(walletDir, file)}:`, error);
      }
    }
  }
  const decoded = decodeInstructions(allTxs);
  const enriched = decoded.map(op => {
    if (op.instructionName !== 'SAGE_OP' || !op.decoded || !Array.isArray(op.decoded) || op.decoded.length === 0) {
      return op;
    }
    const decodedOp = op.decoded[0];
    if (decodedOp?.name !== 'FleetStateHandler' || !op.txInfo?.logMessages) {
      return op;
    }
    const enrichment = enrichFleetStateHandler(
      decodedOp.name,
      op.txInfo.logMessages,
      op.signature,
      op.txInfo.blockTime,
    );
    return {
      ...op,
      decoded: [{
        ...decodedOp,
        name: enrichment.enrichedName,
        originalName: enrichment.originalName,
        stateType: enrichment.stateType,
        stateDetails: enrichment.stateData,
      }],
      instructionName: enrichment.enrichedName,
    };
  });
  const sageOps = enriched.filter(op => op.success && op.instructionName !== 'Unknown');
  const unknown = enriched.filter(op => !op.success || op.instructionName === 'Unknown');
  await saveSageOpsToCache(profileId, sageOps);
  if (unknown.length > 0) await saveUnknownOps(profileId, unknown);
  const total = sageOps.length + unknown.length;
  console.log(`[API] decode-sage-ops-full: profileId=${profileId} totale tx=${total}, sageOps=${sageOps.length}, unknown=${unknown.length}`);
  return { sageOps, unknown };
}
