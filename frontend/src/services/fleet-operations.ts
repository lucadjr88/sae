// public/js/fleet-operations.ts
import { inferMaterialLabel, normalizeOpName } from '@utils/utils';
import { renderCraftingDetailsRows } from '@ui/renderDetails';
import type { CraftingDetail, Prices } from '../types/details';
import type {
  OperationStats,
  FleetFeeData,
  FeesByFleet,
  OperationSummary,
  FeesByOperation,
  FleetOperationInfo,
  OperationListData,
} from '../types/operation-list.js';

interface FleetNamesMap {
  [fleetAccount: string]: string;
}

export function createFleetList(
  data: OperationListData,
  fleetNames: FleetNamesMap,
  rentedFleetNames: Set<string> = new Set()
): void {
  const fleetListDiv = document.getElementById('fleetList') as HTMLDivElement | null;
  if (!fleetListDiv) {
    console.warn('[createFleetList] fleetList element not found');
    return;
  }

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
  const sortedFleets = (Object.entries(data.feesByFleet) as Array<[string, FleetFeeData]>)
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
            <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((fleetData.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    const normalizedOpsMap: Record<string, OperationStats> = {};
    const isCraftingCategory = fleetAccount === 'Crafting Operations';
    (Object.entries(fleetData.operations || {}) as Array<[string, OperationStats]>).forEach(([opName, stats]) => {
      const normName = normalizeOpName(opName);
      if (!normalizedOpsMap[normName]) {
        normalizedOpsMap[normName] = { count: 0, totalFee: 0, avgFee: 0, percentageOfFleet: 0, details: [] };
      }
      normalizedOpsMap[normName].count += stats.count;
      normalizedOpsMap[normName].totalFee += stats.totalFee;
      if (stats.details && Array.isArray(stats.details)) {
        // Normalizza operationName anche nei dettagli
        const normDetails = stats.details.map(d => {
          if (d && typeof d === 'object' && d.operationName) {
            return { ...d, operationName: normalizeOpName(d.operationName) };
          }
          return d;
        });
        normalizedOpsMap[normName].details = normalizedOpsMap[normName].details.concat(normDetails);
      }
    });

    const ops = Object.entries(normalizedOpsMap).filter(([, stats]) => stats.count > 0);

    // Calcola il totale operazioni per la fleet per percentuali
    const totalFleetOps = ops.reduce((sum, [, s]) => sum + (s.count || 0), 0) || 1;

    // Ricalcola percentageOfFleet basato sui count normalizzati
    Object.values(normalizedOpsMap).forEach(s => {
      s.percentageOfFleet = (s.count / totalFleetOps) * 100;
    });

    // Mostra le operazioni della flotta
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {
      // Render operation summary row for non-crafting fleets
      if (!isCraftingCategory) {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${stats.percentageOfFleet.toFixed(1)}%</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((stats.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'}</td>
          </tr>
        `;
      }

      // COMMENTATA: logica dettagli custom
      /*
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
      */
      // If there are per-transaction details (e.g., crafting), render them below the op
      // DISABLED: No details expansion for ops in Fleet Breakdown - keep it simple
      /*
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
      */
    });

    html += `
          </table>
        </div>
      </div>
    `;
  });

  fleetListDiv.innerHTML = html;
}

export function createOperationList(
  data: OperationListData,
  fleetNames: FleetNamesMap,
  rentedFleetNames: Set<string> = new Set()
): void {
  const operationListDiv = document.getElementById('operationList') as HTMLDivElement | null;
  if (!operationListDiv) {
    console.warn('[createOperationList] operationList element not found');
    return;
  }

  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // Build a map of operation -> list of fleets with that operation
  const operationFleetMap: Record<string, FleetOperationInfo[]> = {};

  (Object.entries(data.feesByFleet) as Array<[string, FleetFeeData]>).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || '').toString().toLowerCase()));

    (Object.entries(fleetData.operations || {}) as Array<[string, OperationStats]>).forEach(([opName, opStats]) => {
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
  // Exclude Unknown operations - they should only appear in All Other Operations
  const normalizedFeesByOperation: Record<string, OperationSummary> = {};
  (Object.entries(data.feesByOperation || {}) as Array<[string, OperationSummary]>).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    // Skip Unknown operations
    if (normName.toLowerCase() === 'unknown') return;
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { count: 0, totalFee: 0, avgFee: 0, details: [] };
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
    
    // For Crafting operation, start collapsed
    const isCrafting = /craft/i.test(operation);

    html += `
      <div class="fleet-item" onclick="toggleFleet('${opId}')">
        <div class="fleet-header">
          <div class="fleet-name">${operation}</div>
          <div class="fleet-ops">${opStats.count} ops</div>
          <div class="fleet-pct">${opPercentage.toFixed(1)}%</div>
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((opStats.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'})</span></div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;

    // For Crafting operation, skip fleet summary row and go directly to details
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
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((fleet.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'}</td>
          </tr>
        `;
      });
    }

    // If the operation carries per-transaction details (e.g., crafting details), render them for crafting ops
    try {
      if (isCrafting && opStats.details && Array.isArray(opStats.details) && opStats.details.length > 0) {
        console.log(`[createOperationList] operation=${operation} has details count=${opStats.details.length}`);
        console.log(`[createOperationList] first detail:`, opStats.details[0]);
        const maxDetails = 50;
        html += `
          <tr>
            <td colspan="5">
              <div class="op-details" style="padding-top:6px;">
                <table class="fleet-ops-table crafting-details-table">
                  <thead>
                    <tr style="background:#1e293b;">
                      <th>Tx</th>
                      <th>Burned</th>
                      <th>Claimed</th>
                      <th style="text-align:right;">Fee (SOL)</th>
                      <th style="text-align:right;">Fee (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
        `;
        opStats.details.slice(0, maxDetails).forEach((d: any) => {
          const sig = d.signature || '';
          const sigShort = sig.substring(0, 8) + '...';
          const feeSol = (d.fee / 1e9).toFixed(6);
          const feeUsd = (window as any).prices?.solana ? ((d.fee / 1e9) * (window as any).prices.solana.usd).toFixed(2) : '--';
          const burnedList = (d.burned || []).map((b: any) => `${b.mint.substring(0, 8)}... (${b.amount.toFixed(2)})`).join('<br>');
          const claimedList = (d.claimed || []).map((c: any) => `${c.mint.substring(0, 8)}... (${c.amount.toFixed(2)})`).join('<br>');
          html += `
            <tr>
              <td><span data-copy style="cursor:pointer;color:#60a5fa;text-decoration:underline;" onclick="copyToClipboard('${sig}', event)" title="Click to copy">${sigShort}</span></td>
              <td style="font-size:11px;color:#fbbf24;">${burnedList || '-'}</td>
              <td style="font-size:11px;color:#34d399;">${claimedList || '-'}</td>
              <td style="text-align:right;">${feeSol}</td>
              <td style="text-align:right;color:#7dd3fc;">${feeUsd}</td>
            </tr>
          `;
        });
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

export function createOtherOperationsList(
  data: OperationListData,
  fleetNames: FleetNamesMap,
  rentedFleetNames: Set<string> = new Set(),
  includedOperations: Set<string> = new Set()
): void {
  const otherOperationsDiv = document.getElementById('otherOperationsList') as HTMLDivElement | null;
  if (!otherOperationsDiv) {
    console.warn('[createOtherOperationsList] otherOperationsList element not found');
    return;
  }

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
  // Include operations from all fleets so "All Other Operations" can list
  // operations that may not belong to a specific excluded category (e.g. Unknown)
  const operationFleetMap: Record<string, FleetOperationInfo[]> = {};

  (Object.entries(data.feesByFleet) as Array<[string, FleetFeeData]>).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || '').toString().toLowerCase()));

    (Object.entries(fleetData.operations || {}) as Array<[string, OperationStats]>).forEach(([opName, opStats]) => {
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
  const normalizedFeesByOperation: Record<string, OperationSummary> = {};
  (Object.entries(data.feesByOperation || {}) as Array<[string, OperationSummary]>).forEach(([opName, stats]) => {
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

  // Get operations from excluded fleets that are NOT in the included operations set
  // Include any operation present in feesByOperation that is not part of the
  // includedOperations set. Do not require a fleet map entry (some ops like
  // 'Unknown' may not be tied to a fleet), we will render with an empty
  // fleet list in that case.
  const otherOperations = Object.entries(normalizedFeesByOperation)
    .filter(([operation, opStats]) => !includedOperations.has(operation))
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
            <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((opStats.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'})</span></div>
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
              <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((fleet.totalFee / 1e9) * (window.prices.solana.usd as number)).toFixed(2) : '--'}</td>
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