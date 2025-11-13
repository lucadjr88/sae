// Star Atlas Market Data API Server
// Installa dipendenze: npm install express cors @solana/web3.js @staratlas/factory node-cache

const express = require('express');
const cors = require('cors');
const { Connection, PublicKey } = require('@solana/web3.js');
const { GmClientService, GmOrderbookService } = require('@staratlas/factory');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 60 }); // Cache per 60 secondi

app.use(cors());
app.use(express.json());

// Configurazione Solana
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const GALACTIC_MARKETPLACE_PROGRAM_ID = 'traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg';

const connection = new Connection(SOLANA_RPC, 'confirmed');
const programId = new PublicKey(GALACTIC_MARKETPLACE_PROGRAM_ID);
const gmClientService = new GmClientService();

// Inizializziamo GmOrderbookService solo dopo aver configurato la connessione
let gmOrderbookService = null;

async function initializeOrderbookService() {
  try {
    gmOrderbookService = new GmOrderbookService();
    await gmOrderbookService.setConnection(connection);
    await gmOrderbookService.setProgramId(programId);
    console.log('✅ GmOrderbookService inizializzato');
  } catch (error) {
    console.error('❌ Errore inizializzazione orderbook:', error);
    console.log('⚠️  Alcuni endpoint potrebbero non funzionare');
  }
}

// ===== ENDPOINTS =====

// GET /api/items - Lista tutti gli items da Galaxy API
app.get('/api/items', async (req, res) => {
  try {
    const cached = cache.get('items');
    if (cached) {
      return res.json(cached);
    }

    const response = await fetch('https://galaxy.staratlas.com/nfts');
    const items = await response.json();
    
    cache.set('items', items);
    res.json(items);
  } catch (error) {
    console.error('Errore fetch items:', error);
    res.status(500).json({ error: 'Errore nel recupero items' });
  }
});

// GET /api/currencies - Lista currency registrate nel marketplace
app.get('/api/currencies', async (req, res) => {
  try {
    const cached = cache.get('currencies');
    if (cached) {
      return res.json(cached);
    }

    const currencies = await gmClientService.getRegisteredCurrencies(
      connection,
      programId,
      false
    );
    
    cache.set('currencies', currencies);
    res.json(currencies);
  } catch (error) {
    console.error('Errore fetch currencies:', error);
    res.status(500).json({ error: 'Errore nel recupero currencies' });
  }
});

// GET /api/orders - Tutti gli ordini aperti nel marketplace
app.get('/api/orders', async (req, res) => {
  try {
    const cached = cache.get('all_orders');
    if (cached) {
      return res.json(cached);
    }

    const orders = await gmClientService.getAllOpenOrders(connection, programId);
    
    cache.set('all_orders', orders);
    res.json(orders);
  } catch (error) {
    console.error('Errore fetch orders:', error);
    res.status(500).json({ error: 'Errore nel recupero ordini' });
  }
});

// GET /api/orders/:mint - Ordini per uno specifico item mint
app.get('/api/orders/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const cacheKey = `orders_${mint}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const orders = await gmClientService.getOpenOrdersForAsset(
      connection,
      new PublicKey(mint),
      programId
    );
    
    cache.set(cacheKey, orders);
    res.json(orders);
  } catch (error) {
    console.error('Errore fetch orders per mint:', error);
    res.status(500).json({ error: 'Errore nel recupero ordini per item' });
  }
});

// GET /api/orderbook/:mint - Orderbook completo per un item
app.get('/api/orderbook/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const cacheKey = `orderbook_${mint}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    if (!gmOrderbookService) {
      return res.status(503).json({ 
        error: 'GmOrderbookService non disponibile',
        message: 'Usa /api/orders/:mint come alternativa'
      });
    }

    // Usa GmOrderbookService per ottenere buy/sell orders organizzati
    const orderbook = gmOrderbookService.getOrderbookForPair(
      new PublicKey(mint),
      // Usa il mint di ATLAS come default currency
      new PublicKey('ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx')
    );
    
    cache.set(cacheKey, orderbook);
    res.json(orderbook);
  } catch (error) {
    console.error('Errore fetch orderbook:', error);
    res.status(500).json({ error: 'Errore nel recupero orderbook' });
  }
});

// GET /api/price/:mint - Calcola miglior prezzo bid/ask per un item
app.get('/api/price/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const cacheKey = `price_${mint}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const orders = await gmClientService.getOpenOrdersForAsset(
      connection,
      new PublicKey(mint),
      programId
    );

    // Separa buy e sell orders
    const buyOrders = orders
      .filter(o => o.orderType === 'buy')
      .sort((a, b) => b.uiPrice - a.uiPrice);
    
    const sellOrders = orders
      .filter(o => o.orderType === 'sell')
      .sort((a, b) => a.uiPrice - b.uiPrice);

    const priceData = {
      mint,
      bestBid: buyOrders[0]?.uiPrice || null,
      bestAsk: sellOrders[0]?.uiPrice || null,
      spread: null,
      midPrice: null,
      buyOrderCount: buyOrders.length,
      sellOrderCount: sellOrders.length,
      totalBuyVolume: buyOrders.reduce((sum, o) => sum + o.orderQtyRemaining, 0),
      totalSellVolume: sellOrders.reduce((sum, o) => sum + o.orderQtyRemaining, 0),
    };

    if (priceData.bestBid && priceData.bestAsk) {
      priceData.spread = priceData.bestAsk - priceData.bestBid;
      priceData.midPrice = (priceData.bestBid + priceData.bestAsk) / 2;
    }
    
    cache.set(cacheKey, priceData);
    res.json(priceData);
  } catch (error) {
    console.error('Errore calcolo prezzo:', error);
    res.status(500).json({ error: 'Errore nel calcolo prezzo' });
  }
});

// GET /api/market-summary - Riassunto completo del marketplace
app.get('/api/market-summary', async (req, res) => {
  try {
    const cached = cache.get('market_summary');
    if (cached) {
      return res.json(cached);
    }

    const [orders, currencies] = await Promise.all([
      gmClientService.getAllOpenOrders(connection, programId),
      gmClientService.getRegisteredCurrencies(connection, programId, false)
    ]);

    // Aggrega statistiche
    const buyOrders = orders.filter(o => o.orderType === 'buy');
    const sellOrders = orders.filter(o => o.orderType === 'sell');
    
    const totalBuyVolume = buyOrders.reduce((sum, o) => 
      sum + (o.uiPrice * o.orderQtyRemaining), 0
    );
    
    const totalSellVolume = sellOrders.reduce((sum, o) => 
      sum + (o.uiPrice * o.orderQtyRemaining), 0
    );

    const summary = {
      timestamp: Date.now(),
      totalOrders: orders.length,
      buyOrders: buyOrders.length,
      sellOrders: sellOrders.length,
      totalBuyVolume,
      totalSellVolume,
      uniqueAssets: [...new Set(orders.map(o => o.orderMint))].length,
      currencies: currencies.length,
    };
    
    cache.set('market_summary', summary, 30);
    res.json(summary);
  } catch (error) {
    console.error('Errore market summary:', error);
    res.status(500).json({ error: 'Errore nel calcolo summary' });
  }
});

// GET /api/items-with-prices - Items con prezzi dal marketplace
app.get('/api/items-with-prices', async (req, res) => {
  try {
    const cached = cache.get('items_with_prices');
    if (cached) {
      return res.json(cached);
    }

    // Fetch items e orders in parallelo
    const [itemsResponse, orders] = await Promise.all([
      fetch('https://galaxy.staratlas.com/nfts'),
      gmClientService.getAllOpenOrders(connection, programId)
    ]);

    const items = await itemsResponse.json();

    // Crea mappa dei prezzi per mint
    const priceMap = {};
    orders.forEach(order => {
      if (!priceMap[order.orderMint]) {
        priceMap[order.orderMint] = {
          buyOrders: [],
          sellOrders: []
        };
      }
      
      if (order.orderType === 'buy') {
        priceMap[order.orderMint].buyOrders.push(order);
      } else {
        priceMap[order.orderMint].sellOrders.push(order);
      }
    });

    // Arricchisci items con i prezzi
    const enrichedItems = items.map(item => {
      const prices = priceMap[item.mint];
      
      if (!prices) {
        return { ...item, marketData: null };
      }

      const buyOrders = prices.buyOrders.sort((a, b) => b.uiPrice - a.uiPrice);
      const sellOrders = prices.sellOrders.sort((a, b) => a.uiPrice - b.uiPrice);

      return {
        ...item,
        marketData: {
          bestBid: buyOrders[0]?.uiPrice || null,
          bestAsk: sellOrders[0]?.uiPrice || null,
          midPrice: buyOrders[0] && sellOrders[0] 
            ? (buyOrders[0].uiPrice + sellOrders[0].uiPrice) / 2 
            : null,
          buyOrderCount: buyOrders.length,
          sellOrderCount: sellOrders.length,
        }
      };
    });
    
    cache.set('items_with_prices', enrichedItems, 60);
    res.json(enrichedItems);
  } catch (error) {
    console.error('Errore items with prices:', error);
    res.status(500).json({ error: 'Errore nel recupero items con prezzi' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    cache: cache.getStats()
  });
});

// Avvio server
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeOrderbookService();
  
  app.listen(PORT, () => {
    console.log(`
🚀 Star Atlas Market API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
🔗 RPC: ${SOLANA_RPC}
📦 Program: ${GALACTIC_MARKETPLACE_PROGRAM_ID}

Endpoints disponibili:
  GET /health
  GET /api/items
  GET /api/currencies
  GET /api/orders
  GET /api/orders/:mint
  GET /api/orderbook/:mint
  GET /api/price/:mint
  GET /api/market-summary
  GET /api/items-with-prices
    `);
  });
}

startServer().catch(console.error);