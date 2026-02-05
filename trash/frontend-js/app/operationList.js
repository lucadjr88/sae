function createOperationList(data, fleetNames, rentedFleetNames = /* @__PURE__ */ new Set(), renderCraftingDetailsRows) {
  const operationListDiv = document.getElementById("operationList");
  if (!operationListDiv) {
    throw new Error("operationList element not found");
  }
  const rentedLc = new Set(
    Array.from(rentedFleetNames).map((n) => (n || "").toString().toLowerCase())
  );
  const operationFleetMap = {};
  Object.entries(data.feesByFleet).forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const isRented = !!(fleetData.isRented || rentedLc.has((fleetName || "").toString().toLowerCase()));
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
  const sortedOperations = Object.entries(data.feesByOperation).sort((a, b) => b[1].totalFee - a[1].totalFee);
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
    try {
      if (opStats.details && Array.isArray(opStats.details) && opStats.details.length > 0) {
        console.log(`[createOperationList] operation=${operation} has details count=${opStats.details.length}`);
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
    } catch (err) {
      console.warn("[createOperationList] could not render op details", err);
    }
    html += `
          </table>
        </div>
      </div>
    `;
  });
  operationListDiv.innerHTML = html;
}
export {
  createOperationList
};
