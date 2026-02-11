// @ts-nocheck

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

    // Response from backend now includes WPAC (GeckoTerminal) merged into the prices object
    window.prices = prices;
    renderPriceTicker(prices);
  } catch {
    renderPriceTicker(null);
  }
}