import { Request, Response } from 'express';
import { getRpcMetrics } from '../utils/rpc-pool.js';

/**
 * Debug: RPC metrics (top-level)
 */
export function rpcMetricsHandler(_req: Request, res: Response) {
  try {
    const metrics = getRpcMetrics();
    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}