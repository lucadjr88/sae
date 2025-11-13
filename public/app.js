// Main application logic for SAGE Fleet Fees Analysis + Market tab

// Tabs handling
function showFees() {
  document.getElementById('fees-view').style.display = '';
  document.getElementById('market-view').style.display = 'none';
  document.getElementById('tab-fees').classList.add('tab-active');
  document.getElementById('tab-market').classList.remove('tab-active');
}

function showMarket() {
  document.getElementById('fees-view').style.display = 'none';
  document.getElementById('market-view').style.display = '';
  document.getElementById('tab-market').classList.add('tab-active');
  document.getElementById('tab-fees').classList.remove('tab-active');
  if (!marketState._bootstrapped) {
    bootstrapMarket();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const tf = document.getElementById('tab-fees');
  const tm = document.getElementById('tab-market');
  if (tf) tf.addEventListener('click', showFees);
  if (tm) tm.addEventListener('click', showMarket);
});

async function analyzeFees() {
  const profileId = document.getElementById('profileId').value.trim();
  const resultsDiv = document.getElementById('results');
  const btn = document.getElementById('analyzeBtn');
  
  if (!profileId) {
    alert('Inserisci un Player Profile ID!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Loading...';
  resultsDiv.innerHTML = '<div class="loading">Processing transaction data...</div>';

  try {
    // Get fleets first to derive wallet from transactions
    console.log('Fetching fleets for profile:', profileId);
    const fleetsResponse = await fetch('/api/fleets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    });
    
    if (!fleetsResponse.ok) {
      throw new Error('Failed to fetch fleets');
    }
    
    const fleetsData = await fleetsResponse.json();
    
    if (!fleetsData.walletAuthority) {
      throw new Error('Could not derive wallet from fleet transactions');
    }
    
    const walletPubkey = fleetsData.walletAuthority;
  const fleets = fleetsData.fleets;
    
    console.log('Derived wallet:', walletPubkey);
    console.log('Fleets found:', fleets.length);
    
    // Collect all fleet-related accounts
    const allFleetAccounts = [];
    const fleetNames = {};
  const fleetRentalStatus = {}; // Track which fleets are rented (from backend)
    
    fleets.forEach(f => {
      // Main accounts
      allFleetAccounts.push(f.data.fleetShips);
      allFleetAccounts.push(f.key);
      
      // Fuel, ammo, cargo
      if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
      if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
      if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
      
      // Map names
      fleetNames[f.data.fleetShips] = f.callsign;
      fleetNames[f.key] = f.callsign;
      if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
      if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
      if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
      
      // Map rental status (backend authoritative flag)
      const initialRented = !!f.isRented;
      fleetRentalStatus[f.data.fleetShips] = initialRented;
      fleetRentalStatus[f.key] = initialRented;
      if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
      if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
      if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
    });

    const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
    console.log('Fleet accounts collected:', uniqueFleetAccounts.length);
    
    // Get detailed fees
    console.log('Fetching detailed fees...');
    const response = await fetch('/api/wallet-sage-fees-detailed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletPubkey, 
        fleetAccounts: uniqueFleetAccounts,
        fleetNames: fleetNames,
        fleetRentalStatus: fleetRentalStatus, // Send rental status
        hours: 24 
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Analysis failed');
    }
    
    console.log('Analysis complete. Transactions:', data.transactionCount24h);
    
    // Collect rented fleet names from fleet list (backend authoritative flags)
    const rentedFleetNames = new Set();
    try {
      fleets.forEach(f => {
        const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
        if (isRented) rentedFleetNames.add(f.callsign);
      });
    } catch {}
    
    console.log('Rented fleets detected from backend:', Array.from(rentedFleetNames));

    // Ensure backend results carry rental flag by fleet name
    // This is critical: feesByFleet may not include all fleets (only those with 24h ops)
    // so we propagate isRented from the fleet list to any matching name in feesByFleet
    try {
      Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
        const isRent = rentedFleetNames.has(String(name)) || rentedFleetNames.has(String(name).trim());
        if (isRent) {
          entry.isRented = true;
        }
      });
    } catch {}

    // Display results
    displayResults(data, fleetNames, rentedFleetNames);
    
  } catch (error) {
    console.error('Analysis error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze 24h';
  }
}

function displayResults(data, fleetNames, rentedFleetNames = new Set()) {
  console.log('Displaying results...');
  const resultsDiv = document.getElementById('results');
  
  // Prepare data for charts
  const sortedFleets = Object.entries(data.feesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 fleets
  
  const sortedOps = Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 operations
  
  const fleetColors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
  const opColors = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#fbbf24'];
  
  console.log('Top 5 fleets:', sortedFleets.map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  console.log('Top 5 operations:', sortedOps.map(([name, data]) => ({ name, fee: data.totalFee })));
  
  const sageFees24h = data.sageFees24h;
  
  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value">${data.transactionCount24h}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fees</div>
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Fees by Fleet (Top 5)</div>
        <div class="chart-container">
          <canvas id="fleetChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="fleetLegend"></div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Fees by Operation (Top 5)</div>
        <div class="chart-container">
          <canvas id="operationChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="operationLegend"></div>
        </div>
      </div>
    </div>

  <h2 class="section-title">Fleet Breakdown</h2>
    <div id="fleetList"></div>

    <h2 class="section-title">Operations Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Operation</th>
          <th class="num">Count</th>
          <th class="num">Total (SOL)</th>
          <th class="num">Avg (SOL)</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .forEach(([operation, stats]) => {
      html += `
        <tr>
          <td class="fleet-name">${operation}</td>
          <td class="num">${stats.count}</td>
          <td class="fee-value num">${(stats.totalFee / 1e9).toFixed(6)}</td>
          <td class="num">${(stats.avgFee / 1e9).toFixed(6)}</td>
        </tr>
      `;
    });
  
  html += `
      </tbody>
    </table>
  `;
  
  resultsDiv.innerHTML = html;
  
  // Create fleet list with fold/unfold
  createFleetList(data, fleetNames, rentedFleetNames);

  // No additional labels; rented fleets are highlighted by name only
  
  // Draw pie charts
  drawPieChart('fleetChart', 'fleetLegend', sortedFleets.map(([name, data], index) => ({
    label: fleetNames[name] || name,
    value: data.totalFee,
    count: data.totalOperations,
    percentage: data.feePercentage,
    color: fleetColors[index]
  })));
  
  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data], index) => ({
    label: name,
    value: data.totalFee,
    count: data.count,
    percentage: data.totalFee / (sageFees24h || 1),
    color: opColors[index]
  })));
  
  console.log('Results displayed successfully');
}

function createFleetList(data, fleetNames, rentedFleetNames = new Set()) {
  const fleetListDiv = document.getElementById('fleetList');
  // Normalize rented fleet names for case-insensitive matching
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));
  
  // List of category names to exclude from Fleet Breakdown
  const categories = [
    'Crafting Operations',
    'Starbase Operations',
    'Configuration',
    'Cargo Management',
    'Crew Management',
    'Survey & Discovery',
    'Player Profile',
    'Fleet Rentals',
    'Universe Management',
    'Game Management',
    'Other Operations'
  ];
  
  // Filter out categories, keep only actual fleets
  const sortedFleets = Object.entries(data.feesByFleet)
    .filter(([fleetAccount, fleetData]) => !categories.includes(fleetAccount))
    .sort((a, b) => {
      const aRented = !!(a[1].isRented || rentedLc.has((fleetNames[a[0]] || a[0] || '').toString().toLowerCase()));
      const bRented = !!(b[1].isRented || rentedLc.has((fleetNames[b[0]] || b[0] || '').toString().toLowerCase()));
      // Rented fleets first
      if (aRented && !bRented) return -1;
      if (!aRented && bRented) return 1;
      // Then by total fee
      return b[1].totalFee - a[1].totalFee;
    });
  
  let html = '';
  sortedFleets.forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const fleetId = 'fleet-' + fleetAccount.substring(0, 8);
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || '').toString().toLowerCase()));
    
    // Debug: log first 3 fleets to verify rental detection
    if (sortedFleets.indexOf([fleetAccount, fleetData]) < 3) {
      console.log(`Fleet ${fleetName}: fleetData.isRented=${fleetData.isRented}, in rentedLc=${rentedLc.has((fleetName || '').toString().toLowerCase())}, isRented=${isRented}`);
    }
    
    const nameClass = isRented ? 'fleet-name rented-name' : 'fleet-name';
    const nameInner = isRented
      ? `<span class="rented-name" style="color:#fbbf24;font-weight:800">${fleetName}</span>`
      : `${fleetName}`;
    
    html += `
      <div class="fleet-item" onclick="toggleFleet('${fleetId}')">
        <div class="fleet-header">
          <div class="${nameClass}">${nameInner}</div>
          <div class="fleet-ops">${fleetData.totalOperations} ops</div>
          <div class="fleet-pct">${(fleetData.feePercentage * 100).toFixed(1)}%</div>
          <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL</div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    
    Object.entries(fleetData.operations)
      .sort((a, b) => b[1].totalFee - a[1].totalFee)
      .forEach(([op, stats]) => {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td>${(stats.percentageOfFleet * 100).toFixed(1)}%</td>
          </tr>
        `;
      });
    
    html += `
          </table>
        </div>
      </div>
    `;
  });
  
  fleetListDiv.innerHTML = html;
}

function toggleFleet(fleetId) {
  const fleetItem = document.getElementById(fleetId).parentElement;
  fleetItem.classList.toggle('expanded');
}

function drawPieChart(canvasId, legendId, data) {
  console.log(`Drawing pie chart: ${canvasId}`, data);
  
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById(legendId);
  
  // Set canvas size with higher resolution
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 100 * dpr;
  canvas.height = 100 * dpr;
  canvas.style.width = '100px';
  canvas.style.height = '100px';
  ctx.scale(dpr, dpr);
  
  const centerX = 50;
  const centerY = 50;
  const radius = 45;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  let currentAngle = -Math.PI / 2; // Start at top
  
  // Draw pie slices
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    
    // Add subtle border between slices
    ctx.strokeStyle = '#0b0e1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    currentAngle += sliceAngle;
  });
  
  // Create legend with format: Nome | Ops | % | SOL
  let legendHtml = '<table>';
  data.forEach((item, index) => {
    const percentage = ((item.percentage || item.value / total) * 100).toFixed(1);
    const solValue = (item.value / 1e9).toFixed(6);
    legendHtml += `
      <tr>
        <td><div style="width: 8px; height: 8px; background: ${item.color}; border-radius: 1px;"></div></td>
        <td>${item.label}</td>
        <td>${item.count} ops</td>
        <td>${percentage}%</td>
        <td>${solValue} SOL</td>
      </tr>
    `;
  });
  legendHtml += '</table>';
  legend.innerHTML = legendHtml;
}

// -------------------- Market Tab --------------------

const marketState = {
  items: [],
  marketSummary: null,
  loading: false,
  searchTerm: '',
  filter: 'all',
  sortBy: 'name',
  error: null,
  backendStatus: 'checking',
  _bootstrapped: false
};

function bootstrapMarket() {
  marketState._bootstrapped = true;
  const search = document.getElementById('marketSearch');
  const filter = document.getElementById('marketFilter');
  const sort = document.getElementById('marketSort');
  const refresh = document.getElementById('marketRefreshBtn');
  if (search) search.addEventListener('input', (e) => { marketState.searchTerm = e.target.value; renderMarket(); });
  if (filter) filter.addEventListener('change', (e) => { marketState.filter = e.target.value; renderMarket(); });
  if (sort) sort.addEventListener('change', (e) => { marketState.sortBy = e.target.value; renderMarket(); });
  if (refresh) refresh.addEventListener('click', fetchMarketData);
  checkBackendAndLoad();
}

async function checkBackendAndLoad() {
  try {
    const res = await fetch('/health');
    if (res.ok) {
      marketState.backendStatus = 'connected';
      fetchMarketData();
    } else {
      marketState.backendStatus = 'error';
      marketState.error = 'Backend risponde ma con errore';
      renderMarket();
    }
  } catch (e) {
    marketState.backendStatus = 'offline';
    marketState.error = 'Backend non raggiungibile.';
    renderMarket();
  }
}

async function fetchMarketData() {
  marketState.loading = true; marketState.error = null; renderMarket();
  try {
    const [itemsRes, summaryRes] = await Promise.all([
      fetch('/api/market/items-with-prices'),
      fetch('/api/market/market-summary').catch(() => null)
    ]);
    if (!itemsRes.ok) throw new Error(`HTTP ${itemsRes.status}`);
    marketState.items = await itemsRes.json();
    if (summaryRes && summaryRes.ok) marketState.marketSummary = await summaryRes.json();
    marketState.backendStatus = 'connected';
  } catch (e) {
    marketState.error = e.message || String(e);
    marketState.backendStatus = 'error';
  } finally {
    marketState.loading = false;
    renderMarket();
  }
}

function getFilteredMarketItems() {
  return marketState.items
    .filter(item => {
      const term = (marketState.searchTerm || '').toLowerCase();
      const matches = (item.name || '').toLowerCase().includes(term) || (item.symbol || '').toLowerCase().includes(term);
      if (marketState.filter === 'all') return matches;
      if (marketState.filter === 'resources') return matches && item.itemType === 'resource';
      if (marketState.filter === 'ships') return matches && item.itemType === 'ship';
      if (marketState.filter === 'collectibles') return matches && item.itemType === 'collectible';
      if (marketState.filter === 'with-prices') return matches && item.marketData !== null;
      return matches;
    })
    .sort((a, b) => {
      switch (marketState.sortBy) {
        case 'name': return (a.name || '').localeCompare(b.name || '');
        case 'price-high': return (b.marketData?.midPrice || 0) - (a.marketData?.midPrice || 0);
        case 'price-low': return ((a.marketData?.midPrice ?? Infinity) - (b.marketData?.midPrice ?? Infinity));
        case 'volume': {
          const aVol = (a.marketData?.buyOrderCount || 0) + (a.marketData?.sellOrderCount || 0);
          const bVol = (b.marketData?.buyOrderCount || 0) + (b.marketData?.sellOrderCount || 0);
          return bVol - aVol;
        }
        default: return 0;
      }
    });
}

function renderMarket() {
  const statusEl = document.getElementById('market-status');
  const statsEl = document.getElementById('market-stats');
  const resultsEl = document.getElementById('market-results');
  if (!statusEl || !resultsEl) return;

  // Status
  if (marketState.loading) {
    statusEl.style.display = '';
    statusEl.textContent = 'Loading market data...';
  } else if (marketState.error) {
    statusEl.style.display = '';
    statusEl.textContent = `Error: ${marketState.error}`;
  } else {
    statusEl.style.display = 'none';
  }

  // Stats
  if (marketState.marketSummary) {
    statsEl.style.display = '';
    const s = marketState.marketSummary;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-value">${(s.totalOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Buy Orders</div><div class="stat-value">${(s.buyOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Sell Orders</div><div class="stat-value">${(s.sellOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Assets</div><div class="stat-value">${(s.uniqueAssets||0).toLocaleString()}</div></div>
    `;
  } else {
    statsEl.style.display = 'none';
  }

  // Table
  const items = getFilteredMarketItems();
  if (!items.length) {
    resultsEl.innerHTML = marketState.loading ? '' : '<div class="loading">No items for filters.</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Type</th>
          <th>Rarity</th>
          <th class="num">Best Bid</th>
          <th class="num">Best Ask</th>
          <th class="num">Mid Price</th>
          <th class="num">Orders</th>
          <th class="num">Supply</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach(item => {
    const md = item.marketData || {};
    const bid = md.bestBid != null ? Number(md.bestBid).toFixed(4) : '-';
    const ask = md.bestAsk != null ? Number(md.bestAsk).toFixed(4) : '-';
    const mid = md.midPrice != null ? Number(md.midPrice).toFixed(4) : '-';
    const ocount = (md.buyOrderCount || 0) + (md.sellOrderCount || 0);
    html += `
      <tr>
        <td>${item.name || ''}<div style="color:#7a8ba0; font-size:10px;">${item.symbol || ''}</div></td>
        <td>${item.itemType || ''}</td>
        <td>${item.rarity || 'common'}</td>
        <td class="num">${bid}</td>
        <td class="num">${ask}</td>
        <td class="num">${mid}</td>
        <td class="num">${ocount}</td>
        <td class="num">${(item.totalSupply ?? 0).toLocaleString()}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  resultsEl.innerHTML = html;
}
