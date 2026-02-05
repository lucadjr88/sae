import { normalizeOpName } from "@utils/utils.js";
import { renderCraftingDetailsRows } from "@ui/renderDetails.js";
function createFleetList(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set()) {
  const fleetListDiv = document.getElementById("fleetList");
  if (!fleetListDiv) {
    console.warn("[createFleetList] fleetList element not found");
    return;
  }
  const rentedLc = new Set(Array.from(rentedFleetNames).map((n) => (n || "").toString().toLowerCase()));
  const excludedCategories = [
    "Starbase Operations",
    "Configuration",
    "Cargo Management",
    "Crew Management",
    "Survey & Discovery",
    "Player Profile",
    "Fleet Rentals",
    "Universe Management",
    "Game Management",
    "Other Operations",
    "Crafting",
    "Crafting Operations"
  ];
  const sortedFleets = Object.entries(data.feesByFleet).sort((a, b) => {
    const aRented = !!(a[1].isRented || rentedLc.has((fleetNames[a[0]] || a[0] || "").toString().toLowerCase()));
    const bRented = !!(b[1].isRented || rentedLc.has((fleetNames[b[0]] || b[0] || "").toString().toLowerCase()));
    if (aRented && !bRented) return -1;
    if (!aRented && bRented) return 1;
    return b[1].totalFee - a[1].totalFee;
  });
  try {
    sortedFleets.forEach(([fleetAccount, fleetData]) => {
      const ops = Object.keys(fleetData.operations || {});
      if (ops.length > 0) {
        console.log(`[createFleetList] Fleet ${fleetNames[fleetAccount] || fleetAccount} ops:`, ops);
      }
    });
  } catch (e) {
    console.warn("[createFleetList] DEBUG log error", e);
  }
  let html = "";
  sortedFleets.forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const fleetId = "fleet-" + fleetAccount.substring(0, 8);
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || "").toString().toLowerCase()));
    if (sortedFleets.indexOf([fleetAccount, fleetData]) < 3) {
      console.log(`Fleet ${fleetName}: fleetData.isRented=${fleetData.isRented}, in rentedLc=${rentedLc.has((fleetName || "").toString().toLowerCase())}, isRented=${isRented}`);
    }
    const nameClass = isRented ? "fleet-name rented-name" : "fleet-name";
    const nameInner = isRented ? `<span class="rented-name" style="color:#fbbf24;font-weight:800">${fleetName}</span>` : `${fleetName}`;
    html += `
      <div class="fleet-item" onclick="toggleFleet('${fleetId}')">
        <div class="fleet-header">
          <div class="${nameClass}">${nameInner}</div>
          <div class="fleet-ops">${fleetData.totalOperations} ops</div>
          <div class="fleet-pct">${(fleetData.totalFee / (data.sageFees24h || 1) * 100).toFixed(1)}%</div>
            <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? (fleetData.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"})</span></div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    const normalizedOpsMap = {};
    const isCraftingCategory = fleetAccount === "Crafting Operations";
    Object.entries(fleetData.operations || {}).forEach(([opName, stats]) => {
      const normName = normalizeOpName(opName);
      if (!normalizedOpsMap[normName]) {
        normalizedOpsMap[normName] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
      }
      normalizedOpsMap[normName].count += stats.count;
      normalizedOpsMap[normName].totalFee += stats.totalFee;
      if (stats.details && Array.isArray(stats.details)) {
        const normDetails = stats.details.map((d) => {
          if (d && typeof d === "object" && d.operationName) {
            return { ...d, operationName: normalizeOpName(d.operationName) };
          }
          return d;
        });
        normalizedOpsMap[normName].details = normalizedOpsMap[normName].details.concat(normDetails);
      }
    });
    const ops = Object.entries(normalizedOpsMap).filter(([, stats]) => stats.count > 0);
    const totalFleetOps = ops.reduce((sum, [, s]) => sum + (s.count || 0), 0) || 1;
    Object.values(normalizedOpsMap).forEach((s) => {
      s.percentageOfFleet = s.count / totalFleetOps * 100;
    });
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {
      if (!isCraftingCategory) {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${stats.percentageOfFleet.toFixed(1)}%</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? (stats.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"}</td>
          </tr>
        `;
      }
    });
    html += `
          </table>
        </div>
      </div>
    `;
  });
  fleetListDiv.innerHTML = html;
}
function createOperationList(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set()) {
  const operationListDiv = document.getElementById("operationList");
  if (!operationListDiv) {
    console.warn("[createOperationList] operationList element not found");
    return;
  }
  const rentedLc = new Set(Array.from(rentedFleetNames).map((n) => (n || "").toString().toLowerCase()));
  const operationFleetMap = {};
  Object.entries(data.feesByFleet).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || "").toString().toLowerCase()));
    Object.entries(fleetData.operations || {}).forEach(([opName, opStats]) => {
      const normName = normalizeOpName(opName);
      if (!operationFleetMap[normName]) {
        operationFleetMap[normName] = [];
      }
      const existingFleetEntry = operationFleetMap[normName].find((e) => e.fleetAccount === fleetAccount);
      if (existingFleetEntry) {
        existingFleetEntry.count += opStats.count;
        existingFleetEntry.totalFee += opStats.totalFee;
      } else {
        operationFleetMap[normName].push({
          fleetAccount,
          fleetName,
          isRented,
          count: opStats.count,
          totalFee: opStats.totalFee,
          percentageOfFleet: opStats.percentageOfFleet
        });
      }
    });
  });
  const normalizedFeesByOperation = {};
  Object.entries(data.feesByOperation || {}).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    }
    normalizedFeesByOperation[normName].count += stats.count;
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
    if (stats.details && Array.isArray(stats.details)) {
      normalizedFeesByOperation[normName].details = normalizedFeesByOperation[normName].details.concat(stats.details);
    }
  });
  const sortedOperations = Object.entries(normalizedFeesByOperation).sort((a, b) => b[1].totalFee - a[1].totalFee);
  try {
    console.log("[createOperationList] Operazioni disponibili:", sortedOperations.map(([op, stats]) => op));
    sortedOperations.forEach(([op, stats]) => {
      console.log(`[createOperationList] Op: ${op}, count: ${stats.count}, totalFee: ${stats.totalFee}`);
    });
  } catch (e) {
    console.warn("[createOperationList] DEBUG log error", e);
  }
  let html = "";
  sortedOperations.forEach(([operation, opStats]) => {
    const opId = "op-" + operation.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 20);
    const fleets = operationFleetMap[operation] || [];
    fleets.sort((a, b) => b.totalFee - a.totalFee);
    const opPercentage = opStats.totalFee / data.sageFees24h * 100;
    html += `
      <div class="fleet-item" onclick="toggleFleet('${opId}')">
        <div class="fleet-header">
          <div class="fleet-name">${operation}</div>
          <div class="fleet-ops">${opStats.count} ops</div>
          <div class="fleet-pct">${opPercentage.toFixed(1)}%</div>
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? (opStats.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"})</span></div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;
    const isCrafting = /craft/i.test(operation);
    if (!isCrafting) {
      fleets.forEach((fleet) => {
        const nameClass = fleet.isRented ? "rented-name" : "";
        const nameStyle = fleet.isRented ? "color:#fbbf24;font-weight:800" : "";
        const fleetNameHtml = fleet.isRented ? `<span class="${nameClass}" style="${nameStyle}">${fleet.fleetName}</span>` : fleet.fleetName;
        const fleetOpPercentage = fleet.totalFee / opStats.totalFee * 100;
        html += `
          <tr>
            <td>${fleetNameHtml}</td>
            <td>${fleet.count}x</td>
            <td>${fleetOpPercentage.toFixed(1)}%</td>
            <td>${(fleet.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? (fleet.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"}</td>
          </tr>
        `;
      });
    }
    html += `
          </table>
        </div>
      </div>
    `;
  });
  operationListDiv.innerHTML = html;
}
function createOtherOperationsList(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set(), includedOperations = /* @__PURE__ */ new Set()) {
  const otherOperationsDiv = document.getElementById("otherOperationsList");
  if (!otherOperationsDiv) {
    console.warn("[createOtherOperationsList] otherOperationsList element not found");
    return;
  }
  const rentedLc = new Set(Array.from(rentedFleetNames).map((n) => (n || "").toString().toLowerCase()));
  const excludedCategories = [
    "Starbase Operations",
    "Configuration",
    "Cargo Management",
    "Crew Management",
    "Survey & Discovery",
    "Player Profile",
    "Fleet Rentals",
    "Universe Management",
    "Game Management",
    "Other Operations",
    "Crafting",
    "Crafting Operations"
  ];
  const operationFleetMap = {};
  Object.entries(data.feesByFleet).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || "").toString().toLowerCase()));
    Object.entries(fleetData.operations || {}).forEach(([opName, opStats]) => {
      const normName = normalizeOpName(opName);
      if (!operationFleetMap[normName]) {
        operationFleetMap[normName] = [];
      }
      const existingFleetEntry = operationFleetMap[normName].find((e) => e.fleetAccount === fleetAccount);
      if (existingFleetEntry) {
        existingFleetEntry.count += opStats.count;
        existingFleetEntry.totalFee += opStats.totalFee;
      } else {
        operationFleetMap[normName].push({
          fleetAccount,
          fleetName,
          isRented,
          count: opStats.count,
          totalFee: opStats.totalFee,
          percentageOfFleet: opStats.percentageOfFleet
        });
      }
    });
  });
  const normalizedFeesByOperation = {};
  Object.entries(data.feesByOperation || {}).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
    }
    normalizedFeesByOperation[normName].count += stats.count;
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
  });
  const otherOperations = Object.entries(normalizedFeesByOperation).filter(([operation, opStats]) => !includedOperations.has(operation)).sort((a, b) => b[1].totalFee - a[1].totalFee);
  if (otherOperations.length === 0) {
    otherOperationsDiv.innerHTML = '<p style="color:#666;padding:10px;">No other operations found.</p>';
    return;
  }
  let html = "";
  otherOperations.forEach(([operation, opStats]) => {
    const opId = "other-op-" + operation.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 20);
    const fleets = operationFleetMap[operation] || [];
    fleets.sort((a, b) => b.totalFee - a.totalFee);
    const opPercentage = opStats.totalFee / data.sageFees24h * 100;
    html += `
      <div class="fleet-item" onclick="toggleFleet('${opId}')">
        <div class="fleet-header">
          <div class="fleet-name">${operation}</div>
          <div class="fleet-ops">${opStats.count} ops</div>
          <div class="fleet-pct">${opPercentage.toFixed(1)}%</div>
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? (opStats.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"})</span></div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;
    const isCrafting = /craft/i.test(operation);
    if (!isCrafting) {
      fleets.forEach((fleet) => {
        const nameClass = fleet.isRented ? "rented-name" : "";
        const nameStyle = fleet.isRented ? "color:#fbbf24;font-weight:800" : "";
        const fleetNameHtml = fleet.isRented ? `<span style="${nameStyle}">${fleet.fleetName}</span>` : fleet.fleetName;
        html += `
            <tr>
              <td>${fleetNameHtml}</td>
              <td>${fleet.count}x</td>
              <td>${fleet.percentageOfFleet.toFixed(1)}%</td>
              <td>${(fleet.totalFee / 1e9).toFixed(6)} SOL</td>
              <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? (fleet.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"}</td>
            </tr>
          `;
      });
    }
    if (opStats.details && Array.isArray(opStats.details) && opStats.details.length > 0) {
      const maxDetails = 50;
      html += `
            <tr>
              <td colspan="5">
                <div class="op-details" style="padding-top:6px;">
                  <table class="fleet-ops-table">
                    <tbody>
      `;
      html += renderCraftingDetailsRows(opStats.details, maxDetails);
      html += `
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          `;
    }
    html += `
          </table>
        </div>
      </div>
    `;
  });
  otherOperationsDiv.innerHTML = html;
}
export {
  createFleetList,
  createOperationList,
  createOtherOperationsList
};
