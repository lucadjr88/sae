// @ts-nocheck
// Price ticker logic extracted from app

interface PriceData {
  usd: string | number;
  icon: string;
}

type Prices = Record<string, PriceData>;

declare global {
  interface Window {
    prices: Prices;
  }
}

export async function updatePriceTicker(renderPriceTicker: (prices: Prices | null) => void): Promise<void> {
  try {
    // Fetch CoinGecko prices via backend proxy
    const cgRes: Response = await fetch('/api/prices');
    let prices: Prices = cgRes.ok ? await cgRes.json() : {};

    // Fetch WPAC price and icon from backend proxy
    let wpacPrice: number | string = '--';
    let wpacIcon: string = 'https://assets.geckoterminal.com/0qgi5on7nw3pnhjg4ejqt01y7pdp';
    try {
      const boomRes: Response = await fetch('/api/wpac');
      if (boomRes.ok) {
        const boomData: any = await boomRes.json();
        const parsedPrice = typeof boomData.price === 'string' ? parseFloat(boomData.price) : boomData.price;
        if (Number.isFinite(parsedPrice)) wpacPrice = parsedPrice;
        if (typeof boomData.icon === 'string' && boomData.icon) wpacIcon = boomData.icon;
      } else {
        console.warn('[WPAC proxy] Response not OK:', boomRes.status);
      }
    } catch (err) {
      console.error('[WPAC proxy] Fetch error:', err);
    }

    // Merge WPAC into prices
    prices['wpac'] = { usd: wpacPrice, icon: wpacIcon };
    window.prices = prices;
    renderPriceTicker(prices);
  } catch {
    renderPriceTicker(null);
  }
}