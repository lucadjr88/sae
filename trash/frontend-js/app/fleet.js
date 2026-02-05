function createFleetList(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set(), renderCraftingDetailsRows) {
  const fleetListDiv = document.getElementById("fleetList");
  if (!fleetListDiv) return;
  const rentedLc = new Set(Array.from(rentedFleetNames).map((n) => (n || "").toString().toLowerCase()));
  const sortedFleets = Object.entries(data.feesByFleet).sort(([aKey, aData], [bKey, bData]) => {
    const aRented = !!(aData.isRented || rentedLc.has((fleetNames[aKey] || aKey || "").toString().toLowerCase()));
    const bRented = !!(bData.isRented || rentedLc.has((fleetNames[bKey] || bKey || "").toString().toLowerCase()));
    if (aRented && !bRented) return -1;
    if (!aRented && bRented) return 1;
    return bData.totalFee - aData.totalFee;
  });
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
          <div class="fleet-ops">
            ${fleetData.totalOperations} ops
          </div>
          <div class="fleet-pct">
            ${(fleetData.totalFee / (data.sageFees24h || 1) * 100).toFixed(1)}%
          </div>
          <div class="fleet-sol">
            ${(fleetData.totalFee / 1e9).toFixed(6)} SOL <span style="color:#7dd3fc;font-size:13px;">($${window.prices && window.prices.solana ? (fleetData.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"})</span>
          </div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    console.log(`[DEBUG][${fleetName}] Operazioni disponibili:`, Object.keys(fleetData.operations));
    console.log(`[DEBUG][${fleetName}] Dettaglio operations:`, fleetData.operations);
    const ops = Object.entries(fleetData.operations);
    const isCraftingCategory = fleetAccount === "Crafting Operations";
    const totalFleetOps = ops.reduce((sum, [, s]) => sum + (s.count || 0), 0) || 1;
    const opLabel = (op) => op;
    ops.sort((a, b) => b[1].totalFee - a[1].totalFee).forEach(([op, stats]) => {
      if (typeof stats.percentageOfFleet !== "number") {
        stats.percentageOfFleet = stats.count / totalFleetOps * 100;
      }
      if (!isCraftingCategory) {
        html += `
          <tr>
            <td>${opLabel(op)}</td>
            <td>${stats.count}x</td>
            <td>${stats.percentageOfFleet.toFixed(1)}%</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td style="color:#7dd3fc;font-size:13px;">$${window.prices && window.prices.solana ? (stats.totalFee / 1e9 * window.prices.solana.usd).toFixed(2) : "--"}</td>
          </tr>
        `;
      }
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
function toggleFleet(fleetId) {
  const fleetItem = document.getElementById(fleetId)?.parentElement;
  if (fleetItem) {
    fleetItem.classList.toggle("expanded");
  }
}
export {
  createFleetList,
  toggleFleet
};
