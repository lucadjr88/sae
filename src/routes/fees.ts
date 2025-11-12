import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import SageServices from '../utils/sageServices';

const router = Router();
const sageServices = SageServices.getInstance();

// Get SAGE fees for a wallet
router.get('/wallet/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const playerPubKey = new PublicKey(address);
    
    // Calculate real SAGE fees
    const fees = await sageServices.calculateSageFees(playerPubKey);
    
    res.json({
      address,
      fees,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
  } catch (error) {
    console.error('Error calculating SAGE fees:', error);
    res.status(400).json({ 
      error: 'Invalid address or calculation error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get fee history
router.get('/history/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = 10 } = req.query;
    
    // For now, return mock history data
    // In a real implementation, this would fetch from a database
    res.json({
      address,
      history: [
        {
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          activity: 'mining',
          fee: 0.5,
          currency: 'ATLAS',
          transaction: 'mock_transaction_id_1'
        },
        {
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          activity: 'transport',
          fee: 1.2,
          currency: 'ATLAS',
          transaction: 'mock_transaction_id_2'
        }
      ],
      limit: Number(limit),
      total: 2,
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching fee history:', error);
    res.status(400).json({ 
      error: 'Invalid address or network error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get current fee rates
router.get('/rates', async (req: Request, res: Response) => {
  try {
    const rates = await sageServices.getCurrentFeeRates();
    
    res.json({
      rates,
      lastUpdated: new Date().toISOString(),
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching fee rates:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;