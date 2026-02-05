// @ts-nocheck
import { FeesByFleet, FleetFeeData, OperationStats } from '@types/operation-list';
import { CraftingDetail } from '../types/details';

// Fleet-related UI logic extracted from app

export function createFleetList(
  data: { feesByFleet: FeesByFleet; sageFees24h?: number },
  fleetNames: Record<string, string>,
  rentedFleetNames: Set<string> = new Set(),
  renderCraftingDetailsRows: (details: CraftingDetail[], maxDetails: number) => string
): void {
  const fleetListDiv = document.getElementById('fleetList') as HTMLElement | null;
  if (!fleetListDiv) return;
  // Normalize rented fleet names for case-insensitive matching
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));

  // Filter out categories, keep only actual fleets
  const sortedFleets: Array<[string, FleetFeeData]> = Object.entries(data.feesByFleet)
    .sort(([aKey, aData]: [string, FleetFeeData], [bKey, bData]: [string, FleetFeeData]) => {
      const aRented = !!(aData.isRented || rentedLc.has((fleetNames[aKey] || aKey || '').toString().toLowerCase()));
      const bRented = !!(bData.isRented || rentedLc.has((fleetNames[bKey] || bKey || '').toString().toLowerCase()));
      // Rented fleets first
      if (aRented && !bRented) return -1;
      if (!aRented && bRented) return 1;
      // Then by total fee
      return bData.totalFee - aData.totalFee;
    });

  let html = '';
  sortedFleets.forEach(([fleetAccount, fleetData]: [string, FleetFeeData]) => {
        // Nessuna normalizzazione: mostra le operazioni raw così come arrivate dal backend
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
          <div class="fleet-ops">
            ${fleetData.totalOperations} ops
          </div>
          <div class="fleet-pct">
            ${((fleetData.totalFee / (data.sageFees24h || 1)) * 100).toFixed(1)}%
          </div>
          <div class="fleet-sol">
            ${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? ((fleetData.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'})</span>
          </div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;

    // DEBUG: logga tutte le chiavi delle operazioni per questa fleet
    console.log(`[DEBUG][${fleetName}] Operazioni disponibili:`, Object.keys(fleetData.operations));
    // DEBUG: logga l'oggetto completo delle operations per ispezione
    console.log(`[DEBUG][${fleetName}] Dettaglio operations:`, fleetData.operations);

    const ops: Array<[string, OperationStats]> = Object.entries(fleetData.operations);
    const isCraftingCategory: boolean = fleetAccount === 'Crafting Operations';

    // Mostra altre operazioni non-crafting
    // Calcola il totale operazioni per la fleet per percentuali
    const totalFleetOps: number = ops.reduce((sum: number, [, s]: [string, OperationStats]) => sum + (s.count || 0), 0) || 1;
    // Mostra direttamente il nome raw dell'operazione
    const opLabel = op => op;

    // Ordina e mostra tutte le operazioni, anche con count 0
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {
      if (typeof stats.percentageOfFleet !== 'number') {
        stats.percentageOfFleet = (stats.count / totalFleetOps) * 100;
      }
      if (!isCraftingCategory) {
        html += `
          <tr>
            <td>${opLabel(op)}</td>
            <td>${stats.count}x</td>
            <td>${stats.percentageOfFleet.toFixed(1)}%</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? ((stats.totalFee / 1e9) * window.prices.solana.usd).toFixed(2) : '--'}</td>
          </tr>
        `;
      }
      // Se è Crafting Operations o se l'operazione ha dettagli, mostra i dettagli
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

export function toggleFleet(fleetId: string): void {
  const fleetItem = document.getElementById(fleetId)?.parentElement as HTMLElement | null;
  if (fleetItem) {
    fleetItem.classList.toggle('expanded');
  }
}

