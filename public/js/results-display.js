// public/js/results-display.js
import { formatTimestamp } from './ui-helpers.js';
import { drawPieChart } from './charts.js';
import { createFleetList, createOperationList, createOtherOperationsList } from './fleet-operations.js';
import { normalizeOpName } from './utils.js';

export function displayPartialResults(update, fleets, fleetRentalStatus) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;

  // Build partial HTML with available data
  const rentedFleetNames = new Set();
  try {
    fleets.forEach(f => {
      const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
      if (isRented) rentedFleetNames.add(f.callsign);
    });
  } catch {}

  // Mark rented fleets in the partial data
  Object.entries(update.feesByFleet || {}).forEach(([name, entry]) => {
    if (rentedFleetNames.has(String(name))) {
      entry.isRented = true;
    }
  });

  // Build simplified HTML for partial view
  let html = `
    <div style="opacity: 0.8;">
      <h2>⏳ Analysis in progress... (${update.percentage}%)</h2>
      <div class="summary">
        <div class="summary-item">
          <span class="label">Total Fees:</span>
          <span class="value">${(update.totalFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((update.totalFees24h / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></span>
        </div>
        <div class="summary-item">
          <span class="label">SAGE Fees:</span>
          <span class="value">${(update.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((update.sageFees24h / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></span>
        </div>
        <div class="summary-item">
          <span class="label">Transactions:</span>
          <span class="value">${update.transactionCount24h || 0}</span>
        </div>
      </div>
  `;

  // Show fleet breakdown if available
  if (update.feesByFleet && Object.keys(update.feesByFleet).length > 0) {

    const sortedFleets = Object.entries(update.feesByFleet)
      .sort((a, b) => b[1].totalFee - a[1].totalFee);

    if (sortedFleets.length > 0) {
      html += '<h3>Fleet Breakdown (partial)</h3><div class="fleet-list">';

      const totalFee = Object.values(update.feesByFleet).reduce((sum, f) => sum + (f.totalFee || 0), 0);
      sortedFleets.forEach(([fleetName, fleetData]) => {
        const isRented = !!fleetData.isRented;
        const nameClass = isRented ? 'rented-name' : '';
        const badge = isRented ? '<span class="rented-badge">RENTED</span>' : '';
        const pct = totalFee ? ((fleetData.totalFee / totalFee) * 100).toFixed(1) : '0.0';
        html += `
          <div class="fleet-item">
            <div class="fleet-header">
              <span class="fleet-name ${nameClass}">${fleetName}</span>
              ${badge}
              <span class="fleet-fee">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((fleetData.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></span>
              <span class="fleet-pct">${pct}%</span>
            </div>
          </div>
        `;
      });

      html += '</div>';
    }
  }

  html += '</div>';
  resultsDiv.innerHTML = html;
}

export function displayResults(data, fleetNames, rentedFleetNames = new Set(), fleets = []) {
  console.log('Displaying results...');
  const resultsDiv = document.getElementById('results');

  // Prepare data for charts
  // Include all fleets, even those with 0 fees
  const completeFeesByFleet = { ...data.feesByFleet };
  fleets.forEach(f => {
    const aliases = [f.key, f.data && f.data.fleetShips].filter(Boolean);
    aliases.forEach(name => {
      if (!completeFeesByFleet[name]) {
        completeFeesByFleet[name] = {
          totalFee: 0,
          feePercentage: 0,
          totalOperations: 0,
          isRented: f.isRented,
          operations: {}
        };
      }
    });
  });

  const sortedFleets = Object.entries(completeFeesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 fleets

  // Normalize operation names and aggregate stats
  const normalizedFeesByOperation = {};
  Object.entries(data.feesByOperation || {}).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { totalFee: 0, count: 0 };
    }
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
    normalizedFeesByOperation[normName].count += stats.count;
  });

  // Build sorted operation entries and ensure crafting-related categories
  // are always present in the operation chart so they are visible.
  const opEntries = Object.entries(normalizedFeesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);
  // Default: top 10 operations
  const topN = opEntries.slice(0, 10);

  // Diagnostic: print available operation keys so we can see what arrived
  try {
    console.log('[displayResults] feesByOperation keys:', Object.keys(data.feesByOperation));
  } catch (e) {
    console.warn('[displayResults] could not log feesByOperation keys', e);
  }

  // Ensure crafting-related categories are included in the top slices.
  // Use both exact names (legacy) and a robust case-insensitive substring match ("craft").
  const ensureNames = ['Crafting', 'CraftBurn', 'CraftStart', 'CraftClaim'];
  // Add exact matches first
  ensureNames.forEach(name => {
    const idx = opEntries.findIndex(e => e[0] === name);
    if (idx !== -1 && !topN.some(e => e[0] === name)) {
      topN.push(opEntries[idx]);
    }
  });
  // Then add any operation whose name contains 'craft' (case-insensitive)
  const craftMatches = opEntries.filter(e => /craft/i.test(e[0]));
  craftMatches.forEach(match => {
    if (!topN.some(e => e[0] === match[0])) topN.push(match);
  });

  // Limit to a reasonable number of slices
  const sortedOps = topN.slice(0, 20);

  const fleetColors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
  // Extended palette for up to 20 operation slices (generated palette)
  const opColors = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#fbbf24', '#ef4444', '#7c3aed', '#14b8a6', '#e879f9', '#60a5fa', '#06b6d4', '#f472b6', '#9ca3af', '#34d399', '#fb7185', '#60a5fa', '#fde68a', '#7dd3fc', '#a78bfa', '#34d399'];

  console.log('Top 5 fleets:', sortedFleets.map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  console.log('Top 5 operations:', sortedOps.map(([name, data]) => ({ name, fee: data.totalFee })));

  const sageFees24h = data.sageFees24h;

  // Determine earliest transaction time from available arrays (support streaming 'allTransactions' or 'transactions')
  let firstTxTimeLabel = 'N/A';
  try {
    const txArray = (data.transactions && data.transactions.length && data.transactions) || (data.allTransactions && data.allTransactions.length && data.allTransactions) || [];
    if (txArray && txArray.length) {
      const times = txArray.map(t => {
        if (t.blockTime) return new Date(t.blockTime * 1000);
        if (t.timestamp) return new Date(t.timestamp);
        return null;
      }).filter(Boolean);
      if (times.length) {
        const earliest = new Date(Math.min(...times.map(d => d.getTime())));
        firstTxTimeLabel = earliest.toLocaleString();
      }
    }
  } catch (e) {
    console.warn('[displayResults] Could not compute first transaction time:', e);
  }

  let html = `
    <div class="analysis-period" style="margin-bottom:12px;color:#9aa6b2;font-size:14px;">Fees for operations in the last 24h from: ${firstTxTimeLabel}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value" style="${data.unknownOperations > 0 ? 'color: #ef4444;' : ''}">
          ${data.transactionCount24h}
          ${data.unknownOperations > 0 ? `<span style="font-size: 0.6em; margin-left: 4px; opacity: 0.8;">(${data.unknownOperations})</span>` : ''}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fees</div>
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((data.sageFees24h / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></div>
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
        <div class="chart-title">Fees by Operation (Top categories; Crafting always included)</div>
        <div class="chart-container">
          <canvas id="operationChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="operationLegend"></div>
        </div>
      </div>
    </div>

  <h2 class="section-title">Fleet Breakdown</h2>
    <div id="fleetList"></div>

    <h2 class="section-title">Operations Summary</h2>
    <div id="operationList"></div>

    <h2 class="section-title">All Other Operations</h2>
    <div id="otherOperationsList"></div>
  `;

  resultsDiv.innerHTML = html;

  // Create fleet list with fold/unfold
  createFleetList({ ...data, feesByFleet: completeFeesByFleet }, fleetNames, rentedFleetNames);

  // Create operation list with fold/unfold
  createOperationList(data, fleetNames, rentedFleetNames);

  // Create other operations list (operations not shown in the main summary)
  const includedOperations = new Set(sortedOps.map(([name]) => name));
  createOtherOperationsList(data, fleetNames, rentedFleetNames, includedOperations);

  // No additional labels; rented fleets are highlighted by name only

  // Draw pie charts
  const totalFleetFee = sortedFleets.reduce((sum, [_, data]) => sum + (data.totalFee || 0), 0);
  drawPieChart('fleetChart', 'fleetLegend', sortedFleets.map(([name, data], index) => ({
    label: fleetNames[name] || name,
    value: data.totalFee,
    count: data.totalOperations,
    percentage: totalFleetFee ? ((data.totalFee / totalFleetFee) * 100) : 0,
    color: fleetColors[index]
  })), window.prices);

  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data], index) => ({
    label: name,
    value: data.totalFee,
    count: data.count,
    percentage: data.totalFee / (sageFees24h || 1),
    color: opColors[index]
  })), window.prices);

  console.log('Results displayed successfully');
}