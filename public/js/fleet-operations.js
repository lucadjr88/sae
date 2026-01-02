// public/js/fleet-operations.js
import { inferMaterialLabel, normalizeOpName } from '../js/utils.js';
import { renderCraftingDetailsRows } from './ui/renderDetails.js';

export function createFleetList(data, fleetNames, rentedFleetNames = new Set()) {
  const fleetListDiv = document.getElementById('fleetList');
  // Normalize rented fleet names for case-insensitive matching
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // List of category names to exclude from Fleet Breakdown
  const excludedCategories = [
    'Starbase Operations',
    'Configuration',
    'Cargo Management',
    'Crew Management',
    'Survey & Discovery',
    'Player Profile',
    'Fleet Rentals',
    'Universe Management',
    'Game Management',
    'Other Operations',
    'Crafting',
    'Crafting Operations'
  ];

  // Filter out categories, keep only actual fleets
  const sortedFleets = Object.entries(data.feesByFleet)
    .filter(([key]) => !excludedCategories.includes(key))
    .sort((a, b) => {
      const aRented = !!(a[1].isRented || rentedLc.has((fleetNames[a[0]] || a[0] || '').toString().toLowerCase()));
      const bRented = !!(b[1].isRented || rentedLc.has((fleetNames[b[0]] || b[0] || '').toString().toLowerCase()));
      // Rented fleets first
      if (aRented && !bRented) return -1;
      if (!aRented && bRented) return 1;
      // Then by total fee
      return b[1].totalFee - a[1].totalFee;
    });

  // DEBUG: Log tutte le operazioni per ogni fleet
  try {
    sortedFleets.forEach(([fleetAccount, fleetData]) => {
      const ops = Object.keys(fleetData.operations || {});
      if (ops.length > 0) {
        console.log(`[createFleetList] Fleet ${fleetNames[fleetAccount] || fleetAccount} ops:`, ops);
      }
    });
  } catch (e) { console.warn('[createFleetList] DEBUG log error', e); }

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
          <div class="fleet-pct">${((fleetData.totalFee / (data.sageFees24h || 1)) * 100).toFixed(1)}%</div>
            <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((fleetData.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;

    // Normalize operation names and aggregate stats for this specific fleet
    const normalizedOpsMap = {};
    Object.entries(fleetData.operations || {}).forEach(([opName, stats]) => {
      const normName = opName; // normalizeOpName(opName); // Temporarily disabled to see raw ops
      if (!normalizedOpsMap[normName]) {
        normalizedOpsMap[normName] = { count: 0, totalFee: 0, details: [] };
      }
      normalizedOpsMap[normName].count += stats.count;
      normalizedOpsMap[normName].totalFee += stats.totalFee;
      if (stats.details && Array.isArray(stats.details)) {
        normalizedOpsMap[normName].details = normalizedOpsMap[normName].details.concat(stats.details);
      }
    });

    const ops = Object.entries(normalizedOpsMap).filter(([, stats]) => stats.count > 0);
    const isCraftingCategory = fleetAccount === 'Crafting Operations';

    // Calcola il totale operazioni per la fleet per percentuali
    const totalFleetOps = ops.reduce((sum, [, s]) => sum + (s.count || 0), 0) || 1;

    // Mostra le operazioni della flotta
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {
      // Assicura che percentageOfFleet sia sempre definito
      if (typeof stats.percentageOfFleet !== 'number') {
        stats.percentageOfFleet = (stats.count / totalFleetOps) * 100;
      }
      
      // Render operation summary row for non-crafting fleets
      if (!isCraftingCategory) {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${stats.percentageOfFleet.toFixed(1)}%</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((stats.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'}</td>
          </tr>
        `;
      }

      // Se l'operazione ha dettagli (es. crafting), mostrali sempre
      if (stats.details && Array.isArray(stats.details) && stats.details.length > 0) {
        const maxDetails = 50;
        html += `
          <tr>
            <td colspan="5">
              <div class="op-details" style="padding-top:6px;">
                <table class="fleet-ops-table">
                  <tbody>
        `;
        html += renderCraftingDetailsRows(stats.details, maxDetails);
        html += `
                  </tbody>
                </table>
              </div>
            </td>
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

export function createOperationList(data, fleetNames, rentedFleetNames = new Set()) {
  const operationListDiv = document.getElementById('operationList');
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // Build a map of operation -> list of fleets with that operation
  const operationFleetMap = {};

  Object.entries(data.feesByFleet).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || '').toString().toLowerCase()));

    Object.entries(fleetData.operations || {}).forEach(([opName, opStats]) => {
      const normName = normalizeOpName(opName);
      if (!operationFleetMap[normName]) {
        operationFleetMap[normName] = [];
      }
      const existingFleetEntry = operationFleetMap[normName].find(e => e.fleetAccount === fleetAccount);
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

  // Normalize data.feesByOperation and aggregate stats
  const normalizedFeesByOperation = {};
  Object.entries(data.feesByOperation || {}).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { count: 0, totalFee: 0, details: [] };
    }
    normalizedFeesByOperation[normName].count += stats.count;
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
    if (stats.details && Array.isArray(stats.details)) {
      normalizedFeesByOperation[normName].details = normalizedFeesByOperation[normName].details.concat(stats.details);
    }
  });

  // Sort operations by total fee
  const sortedOperations = Object.entries(normalizedFeesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);

  // DEBUG: Log tutte le operazioni disponibili e i dati associati
  try {
    console.log('[createOperationList] Operazioni disponibili:', sortedOperations.map(([op, stats]) => op));
    sortedOperations.forEach(([op, stats]) => {
      console.log(`[createOperationList] Op: ${op}, count: ${stats.count}, totalFee: ${stats.totalFee}`);
    });
  } catch (e) { console.warn('[createOperationList] DEBUG log error', e); }

  let html = '';
  sortedOperations.forEach(([operation, opStats]) => {
    const opId = 'op-' + operation.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
    const fleets = operationFleetMap[operation] || [];

    // Sort fleets by total fee for this operation (descending)
    fleets.sort((a, b) => b.totalFee - a.totalFee);

    // Calculate percentage of total fees for this operation
    const opPercentage = (opStats.totalFee / data.sageFees24h) * 100;

    html += `
      <div class="fleet-item" onclick="toggleFleet('${opId}')">
        <div class="fleet-header">
          <div class="fleet-name">${operation}</div>
          <div class="fleet-ops">${opStats.count} ops</div>
          <div class="fleet-pct">${opPercentage.toFixed(1)}%</div>
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((opStats.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;

    // For Crafting operation, skip fleet summary row and go directly to details
    const isCrafting = /craft/i.test(operation);

    if (!isCrafting) {
      fleets.forEach(fleet => {
        const nameClass = fleet.isRented ? 'rented-name' : '';
        const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
        const fleetNameHtml = fleet.isRented
          ? `<span class="${nameClass}" style="${nameStyle}">${fleet.fleetName}</span>`
          : fleet.fleetName;

        // Calculate percentage of this operation's fees from this fleet
        const fleetOpPercentage = (fleet.totalFee / opStats.totalFee) * 100;

        html += `
          <tr>
            <td>${fleetNameHtml}</td>
            <td>${fleet.count}x</td>
            <td>${fleetOpPercentage.toFixed(1)}%</td>
            <td>${(fleet.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((fleet.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'}</td>
          </tr>
        `;
      });
    }

    // If the operation carries per-transaction details (e.g., crafting details), render them
    try {
      if (opStats.details && Array.isArray(opStats.details) && opStats.details.length > 0) {
        console.log(`[createOperationList] operation=${operation} has details count=${opStats.details.length}`);
        // Limit details shown to avoid overly long pages; show first 50 and indicate more
        const maxDetails = 50;
        html += `
          <tr>
            <td colspan="5">
              <div class="op-details" style="padding-top:6px;">
                <table class="fleet-ops-table">
                  <tbody>
        `;
        // TODO: renderCraftingDetailsRows(opStats.details, maxDetails);
        html += renderCraftingDetailsRows(opStats.details, maxDetails);
        html += `
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.warn('[createOperationList] could not render op details', err);
    }

    html += `
          </table>
        </div>
      </div>
    `;
  });

  operationListDiv.innerHTML = html;
}

export function createOtherOperationsList(data, fleetNames, rentedFleetNames = new Set(), includedOperations = new Set()) {
  const otherOperationsDiv = document.getElementById('otherOperationsList');
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // List of category names excluded from Fleet Breakdown
  const excludedCategories = [
    'Starbase Operations',
    'Configuration',
    'Cargo Management',
    'Crew Management',
    'Survey & Discovery',
    'Player Profile',
    'Fleet Rentals',
    'Universe Management',
    'Game Management',
    'Other Operations',
    'Crafting',
    'Crafting Operations'
  ];

  // Build a map of operation -> list of fleets with that operation
  // ONLY from fleets excluded from Fleet Breakdown
  const operationFleetMap = {};

  Object.entries(data.feesByFleet).forEach(([fleetAccount, fleetData]) => {
    // Only include fleets that are EXCLUDED from Fleet Breakdown
    if (!excludedCategories.includes(fleetAccount)) return;

    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || '').toString().toLowerCase()));

    Object.entries(fleetData.operations || {}).forEach(([opName, opStats]) => {
      const normName = normalizeOpName(opName);
      if (!operationFleetMap[normName]) {
        operationFleetMap[normName] = [];
      }
      const existingFleetEntry = operationFleetMap[normName].find(e => e.fleetAccount === fleetAccount);
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

  // Normalize data.feesByOperation for otherOperations
  const normalizedFeesByOperation = {};
  Object.entries(data.feesByOperation || {}).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { count: 0, totalFee: 0 };
    }
    normalizedFeesByOperation[normName].count += stats.count;
    normalizedFeesByOperation[normName].totalFee += stats.totalFee;
  });

  // Get operations from excluded fleets that are NOT in the included operations set
  const otherOperations = Object.entries(normalizedFeesByOperation)
    .filter(([operation, opStats]) => !includedOperations.has(operation) && operationFleetMap[operation])
    .sort((a, b) => b[1].totalFee - a[1].totalFee);

  if (otherOperations.length === 0) {
    otherOperationsDiv.innerHTML = '<p style="color:#666;padding:10px;">No other operations found.</p>';
    return;
  }

  let html = '';
  otherOperations.forEach(([operation, opStats]) => {
    const opId = 'other-op-' + operation.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
    const fleets = operationFleetMap[operation] || [];

    // Sort fleets by total fee for this operation (descending)
    fleets.sort((a, b) => b.totalFee - a.totalFee);

    // Calculate percentage of total fees for this operation
    const opPercentage = (opStats.totalFee / data.sageFees24h) * 100;

    html += `
      <div class="fleet-item" onclick="toggleFleet('${opId}')">
        <div class="fleet-header">
          <div class="fleet-name">${operation}</div>
          <div class="fleet-ops">${opStats.count} ops</div>
          <div class="fleet-pct">${opPercentage.toFixed(1)}%</div>
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((opStats.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;

    // For Crafting operation, skip fleet summary row and go directly to details
    const isCrafting = /craft/i.test(operation);

    if (!isCrafting) {
      fleets.forEach(fleet => {
        const nameClass = fleet.isRented ? 'rented-name' : '';
        const nameStyle = fleet.isRented ? 'color:#fbbf24;font-weight:800' : '';
        const fleetNameHtml = fleet.isRented
          ? `<span style="${nameStyle}">${fleet.fleetName}</span>`
          : fleet.fleetName;

        html += `
            <tr>
              <td>${fleetNameHtml}</td>
              <td>${fleet.count}x</td>
              <td>${fleet.percentageOfFleet.toFixed(1)}%</td>
              <td>${(fleet.totalFee / 1e9).toFixed(6)} SOL</td>
              <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((fleet.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'}</td>
            </tr>
          `;
      });
    }

    // If operation has details, show them
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