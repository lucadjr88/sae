import { Request, Response } from 'express';
import fetch from 'node-fetch';

/**
 * Proxy prezzo e icona WPAC
 */
export async function wpacHandler(_req: Request, res: Response) {
  try {
    const gtRes = await fetch('https://api.geckoterminal.com/api/v2/networks/polygon_pos/tokens/0x2f77e0afaee06970bf860b8267b5afecfff6f216');
    if (!gtRes.ok) return res.status(502).json({ error: 'Failed to fetch WPAC from GeckoTerminal' });

    const gtJson: any = await gtRes.json();
    const attrs = gtJson?.data?.attributes ?? {};

    const priceUsd = typeof attrs.price_usd === 'string' ? parseFloat(attrs.price_usd) : Number(attrs.price_usd);
    const wpacPrice = Number.isFinite(priceUsd) ? priceUsd : null;
    const wpacIcon = typeof attrs.image_url === 'string' ? attrs.image_url : null;

    res.json({ price: wpacPrice, icon: wpacIcon });
  } catch (err) {
    res.status(500).json({ error: 'WPAC fetch error', details: err instanceof Error ? err.message : String(err) });
  }
}