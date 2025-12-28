// Price ticker logic extracted from app.js

export async function updatePriceTicker(renderPriceTicker) {
  try {
    // Fetch CoinGecko prices via backend proxy
    const cgRes = await fetch('/api/prices');
    let prices = cgRes.ok ? await cgRes.json() : {};

    // Fetch WPAC price and icon from backend proxy
    let wpacPrice = '--';
    let wpacIcon = 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png';
    try {
      const boomRes = await fetch('/api/wpac');
      if (boomRes.ok) {
        const boomData = await boomRes.json();
        if (boomData.price) wpacPrice = boomData.price;
        if (boomData.icon) wpacIcon = boomData.icon;
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
