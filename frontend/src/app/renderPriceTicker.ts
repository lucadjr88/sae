// Render price ticker DOM
interface Asset {
  symbol: string;
  id: string;
  icon: string;
}

interface PriceInfo {
  usd: number | string;
}

interface PriceData {
  [key: string]: PriceInfo;
}

export function renderPriceTicker(prices: PriceData | undefined): void {
  const ticker = document.getElementById('price-ticker-content') as HTMLElement | null;
  if (!ticker) return;

  // Asset config: symbol, CoinGecko id, SVG icon URL
  const assets: Asset[] = [
    { symbol: 'BTC', id: 'bitcoin', icon: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
    { symbol: 'SOL', id: 'solana', icon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
    { symbol: 'ATLAS', id: 'star-atlas', icon: 'https://assets.coingecko.com/coins/images/17659/standard/Icon_Reverse.png?1696517190' },
    { symbol: 'POLIS', id: 'star-atlas-dao', icon: 'https://assets.coingecko.com/coins/images/17789/standard/POLIS.jpg?1696517312' },
    { symbol: 'WPAC', id: 'wpac', icon: 'https://www.geckoterminal.com/_next/image?url=https%3A%2F%2Fassets.geckoterminal.com%2Fujk203lxsmobneroynh7hfyqhabo&w=128&q=75' },
  ];

  // Calculate item width so 4 out of 5 are always visible and fill the bar
  const bar = document.getElementById('price-ticker-bar') as HTMLElement | null;
  if (!bar) return;
  const barWidth = bar.offsetWidth;
  const itemWidth = Math.floor(barWidth / 4);

  // Build ticker items
  let itemsHtml = '';
  assets.forEach(asset => {
    let price: string = '--';
    if (prices && prices[asset.id] && prices[asset.id].usd !== undefined && prices[asset.id].usd !== '--') {
      const usd = prices[asset.id].usd;
      if (typeof usd === 'number') {
        if (asset.symbol === 'BTC') {
          price = usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (asset.symbol === 'SOL') {
          price = usd.toFixed(2);
        } else {
          price = usd.toFixed(4);
        }
      }
    }
    const iconUrl = asset.icon;
    itemsHtml += `
      <div class="ticker-item" style="display:flex;align-items:center;gap:8px;min-width:${itemWidth}px;max-width:${itemWidth}px;justify-content:center;">
        <img src="${iconUrl}" alt="${asset.symbol}" style="width:22px;height:22px;vertical-align:middle;" onerror="this.style.opacity=0.3;">
        <span style="font-weight:600;letter-spacing:1px;">${asset.symbol}</span>
        <span style="font-size:15px;color:#e2e8f0;">$${price}</span>
      </div>
    `;
  });

  // Duplicate items for seamless loop
  ticker.innerHTML = itemsHtml + itemsHtml;
  ticker.style.display = 'flex';
}