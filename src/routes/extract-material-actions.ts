import { Request, Response } from 'express';

/**
 * API: Extract material/token actions for a list of transaction signatures
 */
export async function extractMaterialActionsHandler(req: Request, res: Response) {
  const { signatures } = req.body;
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return res.status(400).json({ error: 'signatures (array) required' });
  }
  try {
    const { extractSageMaterialActions } = await import('../utils/extract-instructions.js');
    const { pickNextRpcConnection } = await import('../utils/rpc-pool.js');
    const actions = await extractSageMaterialActions(pickNextRpcConnection, signatures);
    res.json({ success: true, actions });
  } catch (err) {
    const errorMsg = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
    console.error('/api/extract-material-actions error:', errorMsg);
    res.status(500).json({ error: errorMsg });
  }
}