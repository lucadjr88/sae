// @ts-nocheck
import { formatTimestamp } from './ui-helpers';
import { currentProfileId } from '@utils/state';
import { drawPieChart } from '@app/charts';
import { createFleetList, createOperationList, createOtherOperationsList } from '@services/fleet-operations';
import { normalizeOpName } from '@utils/utils';
import type { PriceData } from '@types/charts';

type OpStats = { totalFee: number; count: number };
type FleetFeeEntry = { totalFee: number; feePercentage?: number; totalOperations?: number; isRented?: boolean; operations?: Record<string, OpStats> };
type PartialUpdate = { percentage: number; totalFees24h: number; sageFees24h: number; transactionCount24h?: number; feesByFleet?: Record<string, FleetFeeEntry> };
type TxLite = { blockTime?: number; timestamp?: number };
type DisplayData = { feesByFleet: Record<string, FleetFeeEntry>; feesByOperation?: Record<string, OpStats>; sageFees24h: number; transactionCount24h: number; unknownOperations: number; transactions?: TxLite[]; allTransactions?: TxLite[] };
type FleetMeta = { key: string; callsign?: string; isRented?: boolean; data?: { fleetShips?: string } };

export function displayPartialResults(update: PartialUpdate, fleets: FleetMeta[], fleetRentalStatus: Record<string, boolean>): void {
  const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
  if (!resultsDiv) return;

  const prices = (typeof window !== 'undefined' ? (window as typeof window & { prices?: PriceData }).prices : undefined);

  // Build partial HTML with available data
  const rentedFleetNames = new Set<string>();
  try {
    fleets.forEach(f => {
      const isRented = !!(fleetRentalStatus[f.key] || (f.data && fleetRentalStatus[f.data.fleetShips]));
      if (isRented) rentedFleetNames.add(f.callsign || '');
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
          <span class="value">${(update.totalFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? ((update.totalFees24h / 1e9) * prices.solana.usd).toFixed(2) : '--'})</span></span>
        </div>
        <div class="summary-item">
          <span class="label">SAGE Fees:</span>
          <span class="value">${(update.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? ((update.sageFees24h / 1e9) * prices.solana.usd).toFixed(2) : '--'})</span></span>
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
              <span class="fleet-fee">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? ((fleetData.totalFee / 1e9) * prices.solana.usd).toFixed(2) : '--'})</span></span>
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
  // Sidebar visibile solo durante la visualizzazione risultati
  if (window.setSidebarVisible) window.setSidebarVisible(true);
}

export function displayResults(data: DisplayData, fleetNames: Record<string, string>, rentedFleetNames: Set<string> = new Set(), fleets: FleetMeta[] = []): void {
  console.log('Displaying results...');
  const sidebar = document.getElementById('sidebar');
  const sidebarProfileId = document.getElementById('sidebarProfileId');
  //console.log('[displayResults] window.currentProfileId:', window.currentProfileId);
  //console.log('[displayResults] sidebar:', sidebar);
  //console.log('[displayResults] sidebarProfileId:', sidebarProfileId);
  if (sidebar) {
    sidebar.style.display = 'flex';
    //console.log('[displayResults] sidebar set to flex');
  }
  // Usa solo currentProfileId da @utils/state
  if (sidebarProfileId && currentProfileId) {
    sidebarProfileId.textContent = currentProfileId.substring(0, 4) + '...' + currentProfileId.substring(currentProfileId.length - 4);
    //console.log('[displayResults] sidebarProfileId updated:', sidebarProfileId.textContent);
  } else {
    //console.log('[displayResults] sidebarProfileId NOT updated');
  }
  const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
  if (!resultsDiv) return;
  // No scrollable class, restore original layout

  const prices = (typeof window !== 'undefined' ? (window as typeof window & { prices?: PriceData }).prices : undefined);
  // Prefer breakdown embedded by the server when present (fallback to top-level fields)
  const feesByFleet = (data && data.feesByFleet) ? data.feesByFleet : (data && (data as any).breakdown && (data as any).breakdown.feesByFleet ? (data as any).breakdown.feesByFleet : {});
  const feesByOperation = (data && data.feesByOperation) ? data.feesByOperation : (data && (data as any).breakdown && (data as any).breakdown.feesByOperation ? (data as any).breakdown.feesByOperation : {});
  const txs = (data.transactions?.length ? data.transactions : data.allTransactions) ?? [];

  // Prepare data for charts
  // Include all fleets, even those with 0 fees (avoid duplicate display names)
  const completeFeesByFleet: Record<string, FleetFeeEntry> = { ...feesByFleet };
  const usedDisplayNames = new Set(
    Object.keys(completeFeesByFleet).map(k => (fleetNames[k] || k || '').toString().toLowerCase())
  );
  fleets.forEach(f => {
    const aliases = [f.key, f.data?.fleetShips].filter(Boolean) as string[];
    const aliasDisplayNames = aliases.map(k => (fleetNames[k] || k || '').toString().toLowerCase());
    if (aliasDisplayNames.some(n => usedDisplayNames.has(n))) return;

    const keyToAdd = aliases.find(k => !completeFeesByFleet[k]) || aliases[0];
    if (!keyToAdd) return;

    completeFeesByFleet[keyToAdd] = {
      totalFee: 0,
      feePercentage: 0,
      totalOperations: 0,
      isRented: f.isRented,
      operations: {}
    };
    usedDisplayNames.add((fleetNames[keyToAdd] || keyToAdd || '').toString().toLowerCase());
  });

  const sortedFleets = Object.entries(completeFeesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 fleets

  // Normalize operation names and aggregate stats
  // Exclude "Unknown" operations from charts and summaries
  const normalizedFeesByOperation: Record<string, OpStats> = {};
  Object.entries(feesByOperation).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    // Skip Unknown operations - they should only appear in All Other Operations
    if (normName.toLowerCase() === 'unknown') return;
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
    //console.log('[displayResults] feesByOperation keys:', Object.keys(feesByOperation));
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

  // Determine earliest transaction time from data.firstTxTime or from txs array
  let firstTxTimeLabel = 'N/A';
  try {
    if (data.firstTxTime) {
      // Use firstTxTime from backend if available
      const date = new Date(data.firstTxTime * 1000);
      firstTxTimeLabel = date.toLocaleString();
    } else if (txs.length) {
      const times = txs.map(t => {
        if (t.blockTime) return new Date(t.blockTime * 1000);
        if (t.timestamp) return new Date(t.timestamp);
        return null;
      }).filter(Boolean) as Date[];
      if (times.length) {
        const earliest = new Date(Math.min(...times.map(d => d.getTime())));
        firstTxTimeLabel = earliest.toLocaleString();
      }
    }
  } catch (e) {
    console.warn('[displayResults] Could not compute first transaction time:', e);
  }

  let html = `
    <div class="analysis-period" style="margin-bottom:12px;color:#9aa6b2;font-size:14px;">
      Fees for operations in the last 24h from: ${firstTxTimeLabel}
      <span class="timer" style="margin-left:12px;font-weight:bold;"></span>
    </div>
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
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? ((data.sageFees24h / 1e9) * prices.solana.usd).toFixed(2) : '--'})</span></div>
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
    <div id="fleetList" class="fleet-list"></div>

    <h2 class="section-title">Operations Summary</h2>
    <div id="operationList" class="operation-list"></div>

    <h2 class="section-title other-ops">All Other Operations</h2>
    <div id="otherOperationsList" class="operation-list"></div>
  `;

  resultsDiv.innerHTML = html;
  // Sidebar visibile solo durante la visualizzazione risultati
  if (window.setSidebarVisible) window.setSidebarVisible(true);

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
  })), prices);

  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data], index) => ({
    label: name,
    value: data.totalFee,
    count: data.count,
    percentage: data.totalFee / (sageFees24h || 1),
    color: opColors[index]
  })), prices);

  console.log('Results displayed successfully');
}