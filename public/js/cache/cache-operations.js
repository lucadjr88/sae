import { startTimer, stopTimer, updateTimerInResults } from './timer-manager.js';
import { hideCacheTooltipAndSidebar, setCacheIconState, setCacheButtonState, resetAllCacheButtons } from './ui-state.js';
import { readSSEStream } from './sse-reader.js';
import { buildFleetAccountsMap, buildRentedFleetNames } from './fleet-processor.js';
// public/js/cache/cache-operations.js
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, setAnalysisStartTime, setProgressInterval } from '../state.js';
import { updateProgress } from '../ui-helpers.js';
import { displayResults, displayPartialResults } from '../results-display.js';
import { setSidebarVisible } from '../ui/sidebar.js';
import { updateCacheTooltip } from '../api.js';

export async function updateCache() {
  if (!currentProfileId) return;

  let timerHandle = null;

  if (!lastAnalysisParams) {
    alert('No previous analysis found. Please run "Analyze 24h" first.');
    return;
  }

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Updating cache (incremental)...');
  console.log('[updateCache] Starting cache update...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheIconState('loading', 'Updating...');
  setCacheButtonState('cacheUpdateBtn', true, '⏳ Updating...');

  try {
    // Use saved parameters from last analysis
    const { walletPubkey, fleetAccounts, fleetNames, fleetRentalStatus, fleets } = lastAnalysisParams;

    console.log('Updating cache for profile:', currentProfileId);
    console.log('Using saved parameters:', {
      walletPubkey: walletPubkey.substring(0, 8) + '...',
      fleetCount: fleetAccounts.length
    });

    // Call streaming endpoint with update=true flag
    const response = await fetch('/api/wallet-sage-fees-stream?update=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletPubkey,
        fleetAccounts,
        fleetNames,
        fleetRentalStatus,
        hours: 24,
        update: true
      })
    });

    const cacheHit = response.headers.get('X-Cache-Hit');
    const cacheTimestamp = response.headers.get('X-Cache-Timestamp');

    if (!response.ok) {
      throw new Error('Failed to fetch wallet fees');
    }

    // Process SSE stream
    const finalData = await readSSEStream(response, {
      onProgress: (data) => {
        displayPartialResults(data, fleets, fleetRentalStatus);
      },
      onComplete: (data) => {
        console.log('[updateCache] Complete! Txs:', data.transactionCount24h);
      },
      onError: null
    });

    console.log('[updateCache] Stream ended. finalData present?', !!finalData);

    const rentedFleetNames = buildRentedFleetNames(fleets, fleetRentalStatus);

    // Render full results with charts
    console.log('[updateCache] Rendering final results...');
    displayResults(finalData, fleetNames, rentedFleetNames);

    // Update cache tooltip
    updateCacheTooltip(cacheHit, cacheTimestamp);

    setCacheIconState('fresh');
    setCacheButtonState('cacheUpdateBtn', false, '⚡ Update Cache');
    // Show sidebar again
    setSidebarVisible(true);
    const sidebarProfileId = document.getElementById('sidebarProfileId');
    if (sidebarProfileId) {
      sidebarProfileId.textContent = currentProfileId.substring(0, 6) + '...';
    }

  } catch (error) {
    console.error('Update error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    setSidebarVisible(true);
  }
}

export async function wipeAndReload() {
  if (!currentProfileId) return;

  let timerHandle = null;

  // Proceed without confirmation popup (auto-confirm)

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Wiping cache and reloading...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheIconState('loading', 'Wiping cache...');
  setCacheButtonState('cacheWipeBtn', true, '⏳ Wiping...');

  try {
    // Call wipe endpoint
    console.log('Wiping cache for profile:', currentProfileId);
    const wipeResponse = await fetch('/api/cache/wipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: currentProfileId })
    });

    if (!wipeResponse.ok) {
      throw new Error('Failed to wipe cache');
    }

    console.log('Cache wiped, reloading data...');
    updateProgress('Cache wiped, fetching fresh data...');

    // Now call refresh
    await refreshAnalysis();

  } catch (error) {
    console.error('Wipe error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    setSidebarVisible(true);
  }
}

export async function refreshAnalysis() {
  if (!currentProfileId) return;

  let timerHandle = null;

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Refreshing fleet data...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheIconState('loading', 'Refreshing...');
  setCacheButtonState('cacheRefreshBtn', true, '⏳ Refreshing...');

  try {
    // Fetch with refresh flag
    console.log('Refreshing fleets for profile:', currentProfileId);
    const fleetsResponse = await fetch('/api/fleets?refresh=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: currentProfileId })
    });

    if (!fleetsResponse.ok) {
      throw new Error('Failed to fetch fleets');
    }

    const fleetsData = await fleetsResponse.json();
    const walletPubkey = fleetsData.walletAuthority;
    const fleets = fleetsData.fleets;

    updateProgress(`Found ${fleets.length} fleets, collecting accounts...`);

    const { accounts: uniqueFleetAccounts, names: fleetNames, rentalStatus: fleetRentalStatus } = buildFleetAccountsMap(fleets);

    updateProgress('Fetching fresh transaction data...');

    // Validate walletPubkey before making request
    if (!walletPubkey) {
      throw new Error('Wallet pubkey not found in fleet data');
    }

    console.log('[refreshAnalysis] Sending request with wallet:', walletPubkey.substring(0, 8) + '...');

    // Use streaming endpoint with refresh flag
    const response = await fetch('/api/wallet-sage-fees-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        walletPubkey: walletPubkey,
        fleetAccounts: uniqueFleetAccounts,
        fleetNames: fleetNames,
        fleetRentalStatus: fleetRentalStatus,
        hours: 24,
          refresh: true,
          enableSubAccountMapping: false
      })
    });

    const cacheHit = response.headers.get('X-Cache-Hit');
    const cacheTimestamp = response.headers.get('X-Cache-Timestamp');

    if (!response.ok) {
      throw new Error(`Failed to fetch transaction data: ${response.statusText}`);
    }

    // Process streaming response
    const finalData = await readSSEStream(response, {
      onProgress: (data) => {
        if (data.feesByFleet) {
          displayPartialResults(data, fleets, fleetRentalStatus);
        }
        const pct = data.percentage || '0';
        const delay = data.currentDelay || '?';
        updateProgress(`${data.message || 'Processing...'} (${pct}% - delay: ${delay}ms)`);
      },
      onComplete: (data) => {
        console.log('[refreshAnalysis] Received COMPLETE event');
        const processedTxs = data.transactionCount24h || 0;
        const totalSigs = data.totalSignaturesFetched || 0;
        updateProgress(`Refreshed: ${processedTxs}/${totalSigs} transactions`);
      },
      onError: null
    });

    console.log('[refreshAnalysis] Stream ended. finalData present?', !!finalData);

    const rentedFleetNames = buildRentedFleetNames(fleets, fleetRentalStatus);

    // Render full results with charts
    console.log('[refreshAnalysis] Rendering final results...');
    displayResults(finalData, fleetNames, rentedFleetNames, fleets);

    // Update cache tooltip
    updateCacheTooltip(cacheHit, cacheTimestamp);

    setCacheIconState('fresh', 'Fresh data. Click to refresh');
    if (profileIcon) {
      profileIcon.onclick = (e) => {
        e.stopPropagation();
        refreshAnalysis();
      };
    }

    // Show sidebar again
    setSidebarVisible(true);
    const sidebarProfileId = document.getElementById('sidebarProfileId');
    if (sidebarProfileId) {
      sidebarProfileId.textContent = currentProfileId.substring(0, 6) + '...';
    }

  } catch (error) {
    console.error('Refresh error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    // Show sidebar even on error
  } finally {
    stopTimer(timerHandle);
    resetAllCacheButtons();
  }
}