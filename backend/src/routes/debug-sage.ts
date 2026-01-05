import express, { Request, Response } from 'express';
import { getSageTransactions, summarizeInstructions, mapTxInstructions, getFleetOpsRaw, getOpMapTable, searchTransactions } from '../services/debugSageService.js';

const router = express.Router();

/**
 * /api/debug/tx-list
 * Input: profileId (required), fleetAccount, fromTimestamp, toTimestamp, limit
 * Output: { transactions: [...] }
 * Edge case: wallet senza tx, fleet non associata, errori RPC
 */
router.post('/tx-list', async (req: Request, res: Response) => {
  try {
    const { profileId, fleetAccount, fromTimestamp, toTimestamp, limit } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });
    const transactions = await getSageTransactions({ profileId, fleetAccount, fromTimestamp, toTimestamp, limit });
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

/**
 * /api/debug/tx-instructions-summary
 * Input: profileId (required), fleetAccount, fromTimestamp, toTimestamp
 * Output: { summary: {...} }
 */
router.post('/tx-instructions-summary', async (req: Request, res: Response) => {
  try {
    const { profileId, fleetAccount, fromTimestamp, toTimestamp } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });
    const summary = await summarizeInstructions({ profileId, fleetAccount, fromTimestamp, toTimestamp });
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

/**
 * /api/debug/tx-mapping-step
 * Input: signatures (array, required), mappingVersion
 * Output: { results: [...] }
 */
router.post('/tx-mapping-step', async (req: Request, res: Response) => {
  try {
    const { signatures, mappingVersion } = req.body;
    if (!Array.isArray(signatures) || signatures.length === 0) return res.status(400).json({ error: 'signatures required' });
    const results = await mapTxInstructions({ signatures, mappingVersion });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

/**
 * /api/debug/fleet-ops-raw
 * Input: fleetAccount (required), fromTimestamp, toTimestamp
 * Output: { operations: [...] }
 */
router.post('/fleet-ops-raw', async (req: Request, res: Response) => {
  try {
    const { fleetAccount, fromTimestamp, toTimestamp } = req.body;
    if (!fleetAccount) return res.status(400).json({ error: 'fleetAccount required' });
    const operations = await getFleetOpsRaw({ fleetAccount, fromTimestamp, toTimestamp });
    res.json({ operations });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

/**
 * /api/debug/mapping-table
 * Input: category, instruction (query)
 * Output: { mapping: [...] }
 */
router.get('/mapping-table', async (req: Request, res: Response) => {
  try {
    const { category, instruction } = req.query;
    const mapping = await getOpMapTable({
      category: typeof category === 'string' ? category : undefined,
      instruction: typeof instruction === 'string' ? instruction : undefined
    });
    res.json({ mapping });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

/**
 * /api/debug/tx-search
 * Input: profileId (required), searchString (required), fromTimestamp, toTimestamp
 * Output: { transactions: [...] }
 */
router.post('/tx-search', async (req: Request, res: Response) => {
  try {
    const { profileId, searchString, fromTimestamp, toTimestamp } = req.body;
    if (!profileId || !searchString) return res.status(400).json({ error: 'profileId and searchString required' });
    const transactions = await searchTransactions({ profileId, searchString, fromTimestamp, toTimestamp });
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) });
  }
});

export default router;
