import { Request, Response } from 'express';
import fetch from 'node-fetch';

/**
 * Proxy prezzi CoinGecko
 */
export async function pricesHandler(_req: Request, res: Response) {
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana,star-atlas,star-atlas-dao&vs_currencies=usd');
    const prices = cgRes.ok ? await cgRes.json() : {};
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
}