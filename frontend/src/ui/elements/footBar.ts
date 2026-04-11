// Modulo per il Footbar (Price Ticker)
// Esporta funzione per creare la struttura reale del ticker prezzi

export const TICKER_CONFIG = [
  {
    id: 'bitcoin',
    img: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    alt: 'BTC',
    symbol: 'BTC'
  },
  {
    id: 'solana',
    img: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    alt: 'SOL',
    symbol: 'SOL'
  },
  {
    id: 'star-atlas',
    img: 'https://assets.coingecko.com/coins/images/17659/standard/Icon_Reverse.png?1696517190',
    alt: 'ATLAS',
    symbol: 'ATLAS'
  },
  {
    id: 'star-atlas-dao',
    img: 'https://assets.coingecko.com/coins/images/17789/standard/POLIS.jpg?1696517312',
    alt: 'POLIS',
    symbol: 'POLIS'
  },
  {
    id: 'wpac',
    img: 'https://www.geckoterminal.com/_next/image?url=https%3A%2F%2Fassets.geckoterminal.com%2Fujk203lxsmobneroynh7hfyqhabo&w=128&q=75',
    alt: 'WPAC',
    symbol: 'WPAC'
  }
];

const PRICE_UPDATE_INTERVAL = 5 * 60 * 1000;

function formatPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toFixed(Math.max(4, -Math.floor(Math.log10(price)) + 2))}`;
}

async function fetchPrices() {
  try {
    const response = await fetch('/api/prices');
    if (!response.ok) throw new Error('Prices fetch failed');
    return await response.json();
  } catch (e) {
    console.log('[FootBar] Failed to fetch prices:', e);
    return null;
  }
}

function updatePricesInDOM(pricesData: any) {
  TICKER_CONFIG.forEach(config => {
    const priceData = pricesData?.[config.id];
    const priceElements = document.querySelectorAll(`.ticker-item[data-id="${config.id}"] .ticker-price`);
    priceElements.forEach(el => {
      el.textContent = priceData?.usd ? formatPrice(priceData.usd) : '--';
    });
  });
}

export function createFootBarElement(): HTMLDivElement {
  const bar = document.createElement('div');
  bar.id = 'price-ticker-bar';
  const content = document.createElement('div');
  content.id = 'price-ticker-content';
  const tickerItems = [...TICKER_CONFIG, ...TICKER_CONFIG];
  tickerItems.forEach(config => {
    const tickerItem = document.createElement('div');
    tickerItem.className = 'ticker-item';
    tickerItem.dataset.id = config.id;
    const img = document.createElement('img');
    img.src = config.img;
    img.alt = config.alt;
    img.onerror = function() { this.classList.add('ticker-img-error'); };
    const symbol = document.createElement('span');
    symbol.className = 'ticker-symbol';
    symbol.textContent = config.symbol;
    const price = document.createElement('span');
    price.className = 'ticker-price';
    price.textContent = '...';
    tickerItem.appendChild(img);
    tickerItem.appendChild(symbol);
    tickerItem.appendChild(price);
    content.appendChild(tickerItem);
  });
  bar.appendChild(content);
  fetchPrices().then(pricesData => {
    if (pricesData) {
      (window as any).prices = pricesData;
      window.dispatchEvent(new CustomEvent('prices-updated'));
    }
    updatePricesInDOM(pricesData);
  });
  setInterval(async () => {
    const pricesData = await fetchPrices();
    if (pricesData) {
      (window as any).prices = pricesData;
      window.dispatchEvent(new CustomEvent('prices-updated'));
    }
    updatePricesInDOM(pricesData);
  }, PRICE_UPDATE_INTERVAL);
  return bar;
}
