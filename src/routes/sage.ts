import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import SageServices from '../utils/sageServices';

const router = Router();
const sageServices = SageServices.getInstance();

// Get SAGE game information
router.get('/game', async (req: Request, res: Response) => {
  try {
    const gameData = await sageServices.getGameData();
    
    res.json({
      gameData,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching SAGE game data:', error);
    res.status(500).json({ 
      error: 'Error fetching game data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get player profile
router.get('/profile/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const playerPubKey = new PublicKey(address);
    
    const profile = await sageServices.getPlayerProfile(playerPubKey);
    
    res.json({
      profile,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching player profile:', error);
    res.status(400).json({ 
      error: 'Invalid address or network error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get fleets information
router.get('/fleets/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const playerPubKey = new PublicKey(address);
    
    const fleets = await sageServices.getPlayerFleets(playerPubKey);
    
    res.json({
      address,
      fleets,
      count: fleets.length,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching fleets data:', error);
    res.status(400).json({ 
      error: 'Invalid address or network error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;