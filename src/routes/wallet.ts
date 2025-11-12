import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';

const router = Router();

// Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Get wallet balance
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const publicKey = new PublicKey(address);
    
    const balance = await connection.getBalance(publicKey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    res.json({
      address,
      balance: {
        lamports: balance,
        sol: solBalance
      }
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(400).json({ error: 'Invalid wallet address or network error' });
  }
});

// Get wallet token accounts
router.get('/tokens/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const publicKey = new PublicKey(address);
    
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    });
    
    const tokens = tokenAccounts.value.map(account => {
      const tokenInfo = account.account.data.parsed.info;
      return {
        mint: tokenInfo.mint,
        amount: tokenInfo.tokenAmount.uiAmount,
        decimals: tokenInfo.tokenAmount.decimals
      };
    });
    
    res.json({
      address,
      tokens
    });
  } catch (error) {
    console.error('Error fetching token accounts:', error);
    res.status(400).json({ error: 'Invalid wallet address or network error' });
  }
});

export default router;