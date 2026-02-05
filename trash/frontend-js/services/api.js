import { normalizeOpName } from "@utils/utils.js";
async function fetchJson(url, init) {
  const headers = { "Content-Type": "application/json", ...init.headers };
  const body = init.body ? JSON.stringify(init.body) : void 0;
  try {
    const response = await fetch(url, { ...init, headers, body });
    if (!response.ok) {
      throw { type: "http", status: response.status, message: response.statusText };
    }
    const data = await response.json();
    return data;
  } catch (error) {
    if (typeof error === "object" && error !== null && "type" in error) {
      throw error;
    }
    throw { type: "network", error };
  }
}
function updateCacheTooltip(cacheHit, cacheTimestamp) {
  const profileIcon = document.getElementById("profileIcon");
  const cacheTooltip = document.getElementById("cacheTooltip");
  if (cacheTooltip) cacheTooltip.style.display = "";
  const cacheTooltipIcon = document.getElementById("cacheTooltipIcon");
  const cacheTooltipTitle = document.getElementById("cacheTooltipTitle");
  const cacheTooltipStatus = document.getElementById("cacheTooltipStatus");
  const cacheTooltipAge = document.getElementById("cacheTooltipAge");
  if (profileIcon && cacheTooltip) {
    profileIcon.classList.remove("cache-fresh", "cache-stale");
    profileIcon.title = "";
    profileIcon.style.opacity = "1";
    let hideTimeout = null;
    profileIcon.onmouseenter = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      cacheTooltip.classList.add("visible");
    };
    profileIcon.onmouseleave = () => {
      hideTimeout = setTimeout(() => {
        cacheTooltip.classList.remove("visible");
      }, 200);
    };
    cacheTooltip.onmouseenter = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };
    cacheTooltip.onmouseleave = () => {
      cacheTooltip.classList.remove("visible");
    };
    const cacheUpdateBtn = document.getElementById("cacheUpdateBtn");
    const cacheWipeBtn = document.getElementById("cacheWipeBtn");
    if (cacheHit === "disk" && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp);
      const sixHoursMs = 6 * 60 * 60 * 1e3;
      const ageMinutes = (cacheAge / 6e4).toFixed(1);
      const ageHours = (cacheAge / 36e5).toFixed(1);
      if (cacheAge < sixHoursMs) {
        profileIcon.classList.add("cache-fresh");
        cacheTooltipIcon.textContent = "\u2705";
        cacheTooltipTitle.textContent = "Cache Fresh";
        cacheTooltipStatus.textContent = "Data loaded from cache";
        cacheTooltipAge.textContent = ageHours < 1 ? `Age: ${ageMinutes} minutes` : `Age: ${ageHours} hours`;
      } else {
        profileIcon.classList.add("cache-stale");
        cacheTooltipIcon.textContent = "\u26A0\uFE0F";
        cacheTooltipTitle.textContent = "Cache Stale";
        cacheTooltipStatus.textContent = "Cache is older than 6 hours";
        cacheTooltipAge.textContent = `Age: ${ageHours} hours`;
      }
    } else {
      profileIcon.classList.add("cache-fresh");
      cacheTooltipIcon.textContent = "\u2728";
      cacheTooltipTitle.textContent = "Fresh Data";
      cacheTooltipStatus.textContent = "Just fetched from API";
      cacheTooltipAge.textContent = "No cached data";
    }
    const updateBtn = document.getElementById("cacheUpdateBtn");
    const wipeBtn = document.getElementById("cacheWipeBtn");
    if (updateBtn) {
      updateBtn.disabled = false;
    }
    if (wipeBtn) {
      wipeBtn.disabled = false;
    }
  }
}
import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval } from "@utils/state.js";
async function analyzeFees() {
  const profileId = document.getElementById("profileId").value.trim();
  const resultsDiv = document.getElementById("results");
  const btn = document.getElementById("analyzeBtn");
  if (!profileId) {
    alert("Inserisci un Player Profile ID!");
    return;
  }
  setCurrentProfileId(profileId);
  const formBox = document.querySelector(".form-box");
  if (formBox) formBox.style.display = "none";
  window.setSidebarVisible(false);
  btn.disabled = true;
  btn.textContent = "Loading...";
  setAnalysisStartTime(Date.now());
  const startTime = Date.now();
  window.updateProgress("Initializing...");
  if (progressInterval) clearInterval(progressInterval);
  setProgressInterval(setInterval(() => {
    if (startTime) {
      const seconds = Math.floor((Date.now() - startTime) / 1e3);
      const resultsDiv2 = document.getElementById("results");
      if (resultsDiv2) {
        const loadingDiv = resultsDiv2.querySelector(".loading");
        if (loadingDiv) {
          const span = loadingDiv.querySelector("span");
          if (span) {
            const text = span.textContent;
            const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
            const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, "").split(" - ")[0];
            span.textContent = `(${message} - ${seconds}s)`;
          }
        }
      }
    }
  }, 1e3));
    try {
    // Call the main analyze endpoint directly with profileId.
    window.updateProgress("Analyzing profile (this may take a while)...");
    let data;
    try {
      data = await fetchJson("/api/analyze-profile", {
        method: "POST",
        body: { profileId }
      });
    } catch (error) {
      throw new Error("analyze-profile request failed: " + (error.message || error));
    }
    const fleets = data.fleets || [];
    const walletPubkey = data.walletAuthority || data.feePayer || null;
    window.updateProgress(`Analyzed ${fleets.length} fleets`);
    const allFleetAccounts = [];
    const fleetNames = {};
    const fleetRentalStatus = {};
    fleets.forEach((f) => {
      if (f && f.data) {
        if (f.data.fleetShips) allFleetAccounts.push(f.data.fleetShips);
        if (f.key) allFleetAccounts.push(f.key);
        if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
        if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
        if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
        fleetNames[f.data.fleetShips] = f.callsign;
        fleetNames[f.key] = f.callsign;
        if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
        if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
        if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
        const initialRented = !!f.isRented;
        if (f.data.fleetShips) fleetRentalStatus[f.data.fleetShips] = initialRented;
        if (f.key) fleetRentalStatus[f.key] = initialRented;
        if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
        if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
        if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
      }
    });
    const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
    setLastAnalysisParams({
      walletPubkey,
      fleetAccounts: uniqueFleetAccounts,
      fleetNames,
      fleetRentalStatus,
      fleets
    });
    const totalSigs = data.totalSignaturesFetched || "N/A";
    const processedTxs = data.transactionCount24h || 0;
    const cacheMsg = data.fromCache ? " (from cache)" : "";
    window.updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions${cacheMsg}`);
    updateCacheTooltip(null, null);
    try {
      const profileIconEnd = document.getElementById("profileIcon");
      if (profileIconEnd) {
        profileIconEnd.textContent = "\u{1F464}";
        profileIconEnd.title = "";
      }
    } catch (_) {
    }
    const rentedFleetNames = /* @__PURE__ */ new Set();
    try {
      fleets.forEach((f) => {
        const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
        if (isRented) rentedFleetNames.add(f.callsign);
      });
    } catch {
    }
    try {
      Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
        const isRent = rentedFleetNames.has(String(name)) || rentedFleetNames.has(String(name).trim());
        if (isRent) {
          entry.isRented = true;
        }
      });
    } catch {
    }
    if (!data.feesByFleet || typeof data.feesByFleet !== "object") {
      data.feesByFleet = {};
    }
    window.displayResults(data, fleetNames, rentedFleetNames);
    if (data && data.breakdown && data.breakdown.feesByFleet && typeof data.breakdown.feesByFleet === "object") {
      displayFleetOperationCharts(data.breakdown.feesByFleet, fleetNames);
    } else if (data && data.breakdown_pending) {
      showBreakdownPending();
    } else {
      // Do not perform additional network calls; frontend must wait for the initial playload.
      showBreakdownPending();
    }
    const sidebar = document.getElementById("sidebar");
    const sidebarProfileId = document.getElementById("sidebarProfileId");
    const container = document.querySelector(".container");
    if (sidebar) {
      sidebar.style.display = "flex";
      if (sidebarProfileId) {
        sidebarProfileId.textContent = profileId.substring(0, 6) + "...";
      }
    }
    if (container) container.classList.add("with-sidebar");
  } catch (error) {
    console.error("Analysis error:", error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
    btn.disabled = false;
    btn.textContent = "Analyze 24h";
  }
}
async function loadFleetBreakdown(profileId, walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus) {
  // Intentionally disabled: avoid any extra backend calls after Analyze button is pressed.
  console.log('loadFleetBreakdown skipped: avoiding additional backend calls.');
  return;
}
function displayFleetOperationCharts(feesByFleet, fleetNames) {
  const resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  const fleetListSection = resultsDiv.querySelector(".fleet-list-section");
  if (!fleetListSection) return;
  const chartsSection = document.createElement("div");
  chartsSection.className = "fleet-charts-section";
  chartsSection.innerHTML = '<h2 class="section-title">Fleet Operation Breakdown</h2>';
  Object.entries(feesByFleet).forEach(([fleetKey, fleetData]) => {
    if (!fleetData.operations || Object.keys(fleetData.operations).length === 0) return;
    const fleetName = fleetNames[fleetKey] || fleetKey;
    const chartContainer = document.createElement("div");
    chartContainer.className = "fleet-chart-container";
    chartContainer.innerHTML = `
			<h3>${fleetName}</h3>
			<div style="display: flex; gap: 20px; align-items: center;">
				<canvas id="chart-${fleetKey}" width="200" height="200"></canvas>
				<div id="legend-${fleetKey}"></div>
			</div>
		`;
    chartsSection.appendChild(chartContainer);
    const normalizedOps = {};
    Object.entries(fleetData.operations || {}).forEach(([opType, opData]) => {
      const normName = normalizeOpName(opType);
      if (!normalizedOps[normName]) {
        normalizedOps[normName] = { count: 0 };
      }
      normalizedOps[normName].count += opData.count;
    });
    const operationData = Object.entries(normalizedOps).map(([opType, opData]) => ({
      label: opType,
      value: opData.count,
      color: getOperationColor(opType)
    }));
    setTimeout(() => {
      const { drawPieChart } = window;
      if (drawPieChart) {
        drawPieChart(`chart-${fleetKey}`, `legend-${fleetKey}`, operationData, window.prices);
      }
    }, 100);
  });
  fleetListSection.parentNode.insertBefore(chartsSection, fleetListSection.nextSibling);
}
function getOperationColor(opType) {
  const norm = (opType || "").toLowerCase();
  const colors = {
    "cargo": "#34d399",
    "dock/undock/load/unload": "#34d399",
    "subwarp": "#60a5fa",
    "mining": "#f59e0b",
    "startminingasteroid": "#f59e0b",
    "crafting": "#a78bfa",
    "createcraftingprocess": "#a78bfa",
    "burncraftingconsumables": "#a78bfa",
    "staking": "#ec4899",
    "token": "#06b6d4",
    "system": "#8b5cf6",
    "compute": "#f97316",
    "memo": "#10b981"
  };
  return colors[norm] || "#9ca3af";
}
// Show a simple pending UI for breakdown without making extra network calls
function showBreakdownPending() {
  const resultsDiv = document.getElementById("results");
  if (!resultsDiv) return;
  const existing = resultsDiv.querySelector(".breakdown-pending");
  if (existing) existing.remove();
  const pending = document.createElement("div");
  pending.className = "breakdown-pending";
  pending.innerHTML = `<div class="loading"><span>(Breakdown pending — waiting for full playload)</span></div>`;
  resultsDiv.prepend(pending);
}
window.analyzeFees = analyzeFees;
export {
  analyzeFees,
  updateCacheTooltip
};
