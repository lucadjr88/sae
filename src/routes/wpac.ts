import { Request, Response } from 'express';
import fetch from 'node-fetch';

/**
 * Proxy prezzo e icona WPAC
 */
export async function wpacHandler(_req: Request, res: Response) {
  try {
    const boomRes = await fetch('https://coinboom.net/coin/pactus');
    if (!boomRes.ok) return res.status(502).json({ error: 'Failed to fetch WPAC from coinboom.net' });
    const boomText = await boomRes.text();
    // Extract price using regex
    const iconMatch = boomText.match(/(https:\/\/storage\.coinboom\.net\/images\/[a-zA-Z0-9\-]+\.webp)/);
    let wpacPrice = null;
    const priceDivMatch = boomText.match(/<span[^>]*>Wrapped PAC Price USD<\/span><div[^>]*style="font-weight: 600;">\\$([0-9]+\.[0-9]+)/);
    if (priceDivMatch) {
      wpacPrice = parseFloat(priceDivMatch[1]);
    }
    const wpacIcon = iconMatch ? iconMatch[1] : null;
    res.json({ price: wpacPrice, icon: wpacIcon });
  } catch (err) {
    res.status(500).json({ error: 'WPAC fetch error', details: err instanceof Error ? err.message : String(err) });
  }
}