import { currentProfileId, analysisStartTime, lastAnalysisParams } from "@utils/state.js";
import { updateProgress } from "@utils/ui-helpers.js";
import { displayResults, displayPartialResults } from "../results-display.js";
import { setSidebarVisible } from "@ui/sidebar.js";
import { updateCacheTooltip } from "./api.js";
function startTimer(callback) {
  return setInterval(callback, 1e3);
}
function stopTimer(handle) {
  if (handle) clearInterval(handle);
}
function updateTimerInResults() {
  const resultsDiv = document.getElementById("results");
  if (resultsDiv && analysisStartTime) {
    const elapsed = Math.floor((Date.now() - analysisStartTime) / 1e3);
    const timerEl = resultsDiv.querySelector(".timer");
    if (timerEl) {
      timerEl.textContent = `${elapsed}s`;
    }
  }
}
function hideCacheTooltipAndSidebar() {
  const cacheTooltip = document.getElementById("cacheTooltip");
  const sidebar = document.getElementById("sidebar");
  if (cacheTooltip) cacheTooltip.style.display = "none";
  if (sidebar) sidebar.style.display = "none";
}
function setCacheIconState(state, title) {
  const profileIcon = document.getElementById("profileIcon");
  if (!profileIcon) return;
  if (state === "loading") {
    profileIcon.textContent = "\u23F3";
    if (title) profileIcon.title = title;
  } else {
    profileIcon.textContent = "\u{1F464}";
    profileIcon.title = title || "";
  }
}
function setCacheButtonState(btnId, disabled, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = disabled;
  if (text) btn.textContent = text;
}
function resetAllCacheButtons() {
  setCacheButtonState("cacheUpdateBtn", false);
  setCacheButtonState("cacheWipeBtn", false);
}
async function readSSEStream(response, handlers) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "complete") {
              finalData = data;
              if (handlers.onComplete) handlers.onComplete(data);
            } else if (data.type === "progress") {
              if (handlers.onProgress) handlers.onProgress(data);
            } else if (data.type === "error" && handlers.onError) {
              handlers.onError(data);
            }
          } catch (e) {
            console.error("Error parsing SSE:", e);
          }
        }
      }
    }
  } catch (error) {
    if (handlers.onError) handlers.onError(error);
    throw error;
  }
  return finalData;
}
function buildFleetAccountsMap(fleets) {
  const map = /* @__PURE__ */ new Map();
  for (const fleet of fleets || []) {
    if (fleet.fleetId) {
      map.set(fleet.fleetId, fleet);
    }
  }
  return map;
}
function buildRentedFleetNames(fleets, fleetRentalStatus) {
  const rentedNames = [];
  for (const fleet of fleets || []) {
    if (fleetRentalStatus?.[fleet.fleetId]?.isRented) {
      rentedNames.push(fleet.fleetName || fleet.fleetId);
    }
  }
  return rentedNames;
}
async function updateCache() {
  if (!currentProfileId) return;
  let timerHandle = null;
  if (!lastAnalysisParams) {
    alert('No previous analysis found. Please run "Analyze 24h" first.');
    return;
  }
  const resultsDiv = document.getElementById("results");
  const profileIcon = document.getElementById("profileIcon");
  const cacheTooltip = document.getElementById("cacheTooltip");
  const cacheUpdateBtn = document.getElementById("cacheUpdateBtn");
  hideCacheTooltipAndSidebar();
  updateProgress("Updating cache (incremental)...");
  console.log("[updateCache] Starting cache update...");
  timerHandle = startTimer(updateTimerInResults);
  setCacheIconState("loading", "Updating...");
  setCacheButtonState("cacheUpdateBtn", true);
  try {
    const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, fleets } = lastAnalysisParams;
    console.log("Updating cache for profile:", currentProfileId);
    console.log("Using saved parameters:", {
      walletPubkey: walletPubkey.substring(0, 8) + "...",
      fleetCount: fleetAccounts.length
    });
    const response = await fetch("/api/wallet-sage-fees-stream?update=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletPubkey,
        fleetAccounts,
        fleetNames,
        fleetRentalStatus,
        hours: 24,
        update: true
      })
    });
    const cacheHit = response.headers.get("X-Cache-Hit");
    const cacheTimestamp = response.headers.get("X-Cache-Timestamp");
    if (!response.ok) {
      throw new Error("Failed to fetch wallet fees");
    }
    const finalData = await readSSEStream(response, {
      onProgress: (data) => {
        displayPartialResults(data, fleets, fleetRentalStatus);
      },
      onComplete: (data) => {
        console.log("[updateCache] Complete! Txs:", data.transactionCount24h);
      },
      onError: null
    });
    console.log("[updateCache] Stream ended. finalData present?", !!finalData);
    const rentedFleetNames = buildRentedFleetNames(fleets, fleetRentalStatus);
    console.log("[updateCache] Rendering final results...");
    displayResults(finalData, fleetNames, rentedFleetNames);
    updateCacheTooltip(cacheHit, cacheTimestamp);
    setCacheIconState("default");
    setCacheButtonState("cacheUpdateBtn", false);
    setSidebarVisible(true);
    const sidebarProfileId = document.getElementById("sidebarProfileId");
    if (sidebarProfileId) {
      sidebarProfileId.textContent = currentProfileId.substring(0, 6) + "...";
    }
  } catch (error) {
    console.error("Update error:", error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    setSidebarVisible(true);
  }
}
async function wipeAndReload() {
  if (!currentProfileId) return;
  let timerHandle = null;
  const resultsDiv = document.getElementById("results");
  const profileIcon = document.getElementById("profileIcon");
  const cacheWipeBtn = document.getElementById("cacheWipeBtn");
  hideCacheTooltipAndSidebar();
  updateProgress("Wiping cache and reloading...");
  timerHandle = startTimer(updateTimerInResults);
  setCacheIconState("loading", "Wiping cache...");
  setCacheButtonState("cacheWipeBtn", true);
  try {
    console.log("Wiping cache for profile:", currentProfileId);
    const wipeResponse = await fetch("/api/cache/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: currentProfileId })
    });
    if (!wipeResponse.ok) {
      throw new Error("Failed to wipe cache");
    }
    console.log("Cache wiped, reloading data...");
    updateProgress("Cache wiped, fetching fresh data...");
    try {
      if (window.analyzeFees) {
        window.analyzeFees();
      }
    } catch (e) {
      console.warn("Failed to trigger analyzeFees after wipe:", e);
      await refreshAnalysis();
    }
  } catch (error) {
    console.error("Wipe error:", error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    setSidebarVisible(true);
  }
}
async function refreshAnalysis() {
  if (!currentProfileId) return;
  let timerHandle = null;
  const resultsDiv = document.getElementById("results");
  const profileIcon = document.getElementById("profileIcon");
  hideCacheTooltipAndSidebar();
  updateProgress("Refreshing fleet data...");
  timerHandle = startTimer(updateTimerInResults);
  setCacheIconState("loading", "Refreshing...");
  setCacheButtonState("cacheUpdateBtn", true);
  try {
    console.log("Refreshing fleets for profile:", currentProfileId);
    const fleetsResponse = await fetch("/api/fleets?refresh=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: currentProfileId })
    });
    if (!fleetsResponse.ok) {
      throw new Error("Failed to fetch fleets");
    }
    const fleetsData = await fleetsResponse.json();
    const walletPubkey = fleetsData.walletAuthority;
    const fleets = fleetsData.fleets;
    updateProgress(`Found ${fleets.length} fleets, collecting accounts...`);
    const { accounts: uniqueFleetAccounts, names: fleetNames, rentalStatus: fleetRentalStatus } = buildFleetAccountsMap(fleets);
    updateProgress("Fetching fresh transaction data...");
    if (!walletPubkey) {
      throw new Error("Wallet pubkey not found in fleet data");
    }
    console.log("[refreshAnalysis] Sending request with wallet:", walletPubkey.substring(0, 8) + "...");
    const response = await fetch("/api/wallet-sage-fees-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletPubkey,
        fleetAccounts: uniqueFleetAccounts,
        fleetNames,
        fleetRentalStatus,
        hours: 24,
        refresh: true,
        enableSubAccountMapping: false
      })
    });
    const cacheHit = response.headers.get("X-Cache-Hit");
    const cacheTimestamp = response.headers.get("X-Cache-Timestamp");
    if (!response.ok) {
      throw new Error(`Failed to fetch transaction data: ${response.statusText}`);
    }
    const finalData = await readSSEStream(response, {
      onProgress: (data) => {
        if (data.feesByFleet) {
          displayPartialResults(data, fleets, fleetRentalStatus);
        }
        const pct = data.percentage || "0";
        const delay = data.currentDelay || "?";
        updateProgress(`${data.message || "Processing..."} (${pct}% - delay: ${delay}ms)`);
      },
      onComplete: (data) => {
        console.log("[refreshAnalysis] Received COMPLETE event");
        const processedTxs = data.transactionCount24h || 0;
        const totalSigs = data.totalSignaturesFetched || 0;
        updateProgress(`Refreshed: ${processedTxs}/${totalSigs} transactions`);
      },
      onError: null
    });
    console.log("[refreshAnalysis] Stream ended. finalData present?", !!finalData);
    const rentedFleetNames = buildRentedFleetNames(fleets, fleetRentalStatus);
    console.log("[refreshAnalysis] Rendering final results...");
    displayResults(finalData, fleetNames, rentedFleetNames, fleets);
    updateCacheTooltip(cacheHit, cacheTimestamp);
    setCacheIconState("default", "Fresh data. Click to refresh");
    if (profileIcon) {
      profileIcon.onclick = (e) => {
        e.stopPropagation();
        refreshAnalysis();
      };
    }
    setSidebarVisible(true);
    const sidebarProfileId = document.getElementById("sidebarProfileId");
    if (sidebarProfileId) {
      sidebarProfileId.textContent = currentProfileId.substring(0, 6) + "...";
    }
  } catch (error) {
    console.error("Refresh error:", error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    resetAllCacheButtons();
  }
}
export {
  refreshAnalysis,
  updateCache,
  wipeAndReload
};
