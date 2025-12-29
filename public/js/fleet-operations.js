// public/js/fleet-operations.js
import { inferMaterialLabel } from '../js/utils.js';
import { renderCraftingDetailsRows } from './ui/renderDetails.js';

export function createFleetList(data, fleetNames, rentedFleetNames = new Set()) {
  const fleetListDiv = document.getElementById('fleetList');
  // Normalize rented fleet names for case-insensitive matching
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // List of category names to exclude from Fleet Breakdown
  const categories = [
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
          <div class="fleet-pct">${((fleetData.totalFee / (data.sageFees24h || 1)) * 100).toFixed(1)}%</div>
            <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((fleetData.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;

    // Raggruppa operazioni di crafting in due categorie: Craft Fuel e Craft Food
    // (ora già fatto dal backend, basta filtrarle)
    const ops = Object.entries(fleetData.operations);
    const isCraftingCategory = fleetAccount === 'Crafting Operations';

    // Mostra altre operazioni non-crafting
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {

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

      // Se è Crafting Operations o se l'operazione ha dettagli, mostra i dettagli
      if (stats.details && Array.isArray(stats.details) && stats.details.length > 0 && !/craft/i.test(op)) {
        const maxDetails = 50;
        html += `
          <tr>
            <td colspan="5">
              <div class="op-details" style="padding-top:6px;">
                <table class="fleet-ops-table">
                  <tbody>
        `;
        // TODO: renderCraftingDetailsRows(stats.details, maxDetails);
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
      if (!operationFleetMap[opName]) {
        operationFleetMap[opName] = [];
      }
      operationFleetMap[opName].push({
        fleetAccount,
        fleetName,
        isRented,
        count: opStats.count,
        totalFee: opStats.totalFee,
        percentageOfFleet: opStats.percentageOfFleet
      });
    });
  });

  // Sort operations by total fee (from data.feesByOperation)
  // Mostra anche le Crafting Operations per dettaglio
  const sortedOperations = Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);

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
      if (!operationFleetMap[opName]) {
        operationFleetMap[opName] = [];
      }
      operationFleetMap[opName].push({
        fleetAccount,
        fleetName,
        isRented,
        count: opStats.count,
        totalFee: opStats.totalFee,
        percentageOfFleet: opStats.percentageOfFleet
      });
    });
  });

  // Get operations from excluded fleets that are NOT in the included operations set
  const otherOperations = Object.entries(data.feesByOperation)
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