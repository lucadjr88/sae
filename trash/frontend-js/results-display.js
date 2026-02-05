import { drawPieChart } from "@app/charts.js";
import { createFleetList, createOperationList, createOtherOperationsList } from "@services/fleet-operations.js";
import { normalizeOpName } from "@utils/utils.js";
function displayPartialResults(update, fleets, fleetRentalStatus) {
  const resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  const prices = typeof window !== "undefined" ? window.prices : void 0;
  const rentedFleetNames = /* @__PURE__ */ new Set();
  try {
    fleets.forEach((f) => {
      const isRented = !!(fleetRentalStatus[f.key] || f.data && fleetRentalStatus[f.data.fleetShips]);
      if (isRented) rentedFleetNames.add(f.callsign || "");
    });
  } catch {
  }
  Object.entries(update.feesByFleet || {}).forEach(([name, entry]) => {
    if (rentedFleetNames.has(String(name))) {
      entry.isRented = true;
    }
  });
  let html = `
    <div style="opacity: 0.8;">
      <h2>\u23F3 Analysis in progress... (${update.percentage}%)</h2>
      <div class="summary">
        <div class="summary-item">
          <span class="label">Total Fees:</span>
          <span class="value">${(update.totalFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? (update.totalFees24h / 1e9 * prices.solana.usd).toFixed(2) : "--"})</span></span>
        </div>
        <div class="summary-item">
          <span class="label">SAGE Fees:</span>
          <span class="value">${(update.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? (update.sageFees24h / 1e9 * prices.solana.usd).toFixed(2) : "--"})</span></span>
        </div>
        <div class="summary-item">
          <span class="label">Transactions:</span>
          <span class="value">${update.transactionCount24h || 0}</span>
        </div>
      </div>
  `;
  if (update.feesByFleet && Object.keys(update.feesByFleet).length > 0) {
    const sortedFleets = Object.entries(update.feesByFleet).sort((a, b) => b[1].totalFee - a[1].totalFee);
    if (sortedFleets.length > 0) {
      html += '<h3>Fleet Breakdown (partial)</h3><div class="fleet-list">';
      const totalFee = Object.values(update.feesByFleet).reduce((sum, f) => sum + (f.totalFee || 0), 0);
      sortedFleets.forEach(([fleetName, fleetData]) => {
        const isRented = !!fleetData.isRented;
        const nameClass = isRented ? "rented-name" : "";
        const badge = isRented ? '<span class="rented-badge">RENTED</span>' : "";
        const pct = totalFee ? (fleetData.totalFee / totalFee * 100).toFixed(1) : "0.0";
        html += `
          <div class="fleet-item">
            <div class="fleet-header">
              <span class="fleet-name ${nameClass}">${fleetName}</span>
              ${badge}
              <span class="fleet-fee">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? (fleetData.totalFee / 1e9 * prices.solana.usd).toFixed(2) : "--"})</span></span>
              <span class="fleet-pct">${pct}%</span>
            </div>
          </div>
        `;
      });
      html += "</div>";
    }
  }
  html += "</div>";
  resultsDiv.innerHTML = html;
}
function displayResults(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set(), fleets = []) {
  console.log("Displaying results...");
  const resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  const prices = typeof window !== "undefined" ? window.prices : void 0;
  const feesByFleet = data && data.feesByFleet ? data.feesByFleet : data && data.breakdown && data.breakdown.feesByFleet ? data.breakdown.feesByFleet : {};
  const feesByOperation = data && data.feesByOperation ? data.feesByOperation : data && data.breakdown && data.breakdown.feesByOperation ? data.breakdown.feesByOperation : {};
  const txs = (data.transactions?.length ? data.transactions : data.allTransactions) ?? [];
  const completeFeesByFleet = { ...feesByFleet };
  fleets.forEach((f) => {
    const aliases = [f.key, f.data?.fleetShips].filter(Boolean);
    aliases.forEach((name) => {
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
  const sortedFleets = Object.entries(completeFeesByFleet).sort((a, b) => b[1].totalFee - a[1].totalFee).slice(0, 5);
  const normalizedFeesByOperation = {};
  Object.entries(feesByOperation).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { totalFee: 0, count: 0 };
    }
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
    normalizedFeesByOperation[normName].count += stats.count;
  });
  const opEntries = Object.entries(normalizedFeesByOperation).sort((a, b) => b[1].totalFee - a[1].totalFee);
  const topN = opEntries.slice(0, 10);
  try {
    console.log("[displayResults] feesByOperation keys:", Object.keys(feesByOperation));
  } catch (e) {
    console.warn("[displayResults] could not log feesByOperation keys", e);
  }
  const ensureNames = ["Crafting", "CraftBurn", "CraftStart", "CraftClaim"];
  ensureNames.forEach((name) => {
    const idx = opEntries.findIndex((e) => e[0] === name);
    if (idx !== -1 && !topN.some((e) => e[0] === name)) {
      topN.push(opEntries[idx]);
    }
  });
  const craftMatches = opEntries.filter((e) => /craft/i.test(e[0]));
  craftMatches.forEach((match) => {
    if (!topN.some((e) => e[0] === match[0])) topN.push(match);
  });
  const sortedOps = topN.slice(0, 20);
  const fleetColors = ["#34d399", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899"];
  const opColors = ["#06b6d4", "#8b5cf6", "#f97316", "#10b981", "#fbbf24", "#ef4444", "#7c3aed", "#14b8a6", "#e879f9", "#60a5fa", "#06b6d4", "#f472b6", "#9ca3af", "#34d399", "#fb7185", "#60a5fa", "#fde68a", "#7dd3fc", "#a78bfa", "#34d399"];
  console.log("Top 5 fleets:", sortedFleets.map(([name, data2]) => ({ name: fleetNames[name] || name, fee: data2.totalFee })));
  console.log("Top 5 operations:", sortedOps.map(([name, data2]) => ({ name, fee: data2.totalFee })));
  const sageFees24h = data.sageFees24h;
  let firstTxTimeLabel = "N/A";
  try {
    if (txs.length) {
      const times = txs.map((t) => {
        if (t.blockTime) return new Date(t.blockTime * 1e3);
        if (t.timestamp) return new Date(t.timestamp);
        return null;
      }).filter(Boolean);
      if (times.length) {
        const earliest = new Date(Math.min(...times.map((d) => d.getTime())));
        firstTxTimeLabel = earliest.toLocaleString();
      }
    }
  } catch (e) {
    console.warn("[displayResults] Could not compute first transaction time:", e);
  }
  let html = `
    <div class="analysis-period" style="margin-bottom:12px;color:#9aa6b2;font-size:14px;">Fees for operations in the last 24h from: ${firstTxTimeLabel}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value" style="${data.unknownOperations > 0 ? "color: #ef4444;" : ""}">
          ${data.transactionCount24h}
          ${data.unknownOperations > 0 ? `<span style="font-size: 0.6em; margin-left: 4px; opacity: 0.8;">(${data.unknownOperations})</span>` : ""}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fees</div>
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? (data.sageFees24h / 1e9 * prices.solana.usd).toFixed(2) : "--"})</span></div>
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

    <h2 class="section-title">All Other Operations</h2>
    <div id="otherOperationsList" class="operation-list"></div>
  `;
  resultsDiv.innerHTML = html;
  createFleetList({ ...data, feesByFleet: completeFeesByFleet }, fleetNames, rentedFleetNames);
  createOperationList(data, fleetNames, rentedFleetNames);
  const includedOperations = new Set(sortedOps.map(([name]) => name));
  createOtherOperationsList(data, fleetNames, rentedFleetNames, includedOperations);
  const totalFleetFee = sortedFleets.reduce((sum, [_, data2]) => sum + (data2.totalFee || 0), 0);
  drawPieChart("fleetChart", "fleetLegend", sortedFleets.map(([name, data2], index) => ({
    label: fleetNames[name] || name,
    value: data2.totalFee,
    count: data2.totalOperations,
    percentage: totalFleetFee ? data2.totalFee / totalFleetFee * 100 : 0,
    color: fleetColors[index]
  })), prices);
  drawPieChart("operationChart", "operationLegend", sortedOps.map(([name, data2], index) => ({
    label: name,
    value: data2.totalFee,
    count: data2.count,
    percentage: data2.totalFee / (sageFees24h || 1),
    color: opColors[index]
  })), prices);
  console.log("Results displayed successfully");
}
export {
  displayPartialResults,
  displayResults
};
