// Fleet-related UI logic extracted from app.js

export function createFleetList(data, fleetNames, rentedFleetNames = new Set(), renderCraftingDetailsRows) {
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

export function toggleFleet(fleetId) {
  const fleetItem = document.getElementById(fleetId).parentElement;
  fleetItem.classList.toggle('expanded');
}
