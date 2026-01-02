// public/js/cache-manager.js
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, setAnalysisStartTime, setProgressInterval } from './state.js';
import { updateProgress } from './ui-helpers.js';
import { displayResults, displayPartialResults } from './results-display.js';
import { setSidebarVisible } from './ui/sidebar.js';
import { updateCacheTooltip } from './api.js';

export async function updateCache() {
  if (!currentProfileId) return;

  if (!lastAnalysisParams) {
    alert('No previous analysis found. Please run "Analyze 24h" first.');
    return;
  }

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');

  // Hide tooltip and sidebar during update
  if (cacheTooltip) cacheTooltip.classList.remove('visible');
  setSidebarVisible(false);

  setAnalysisStartTime(Date.now());
  if (progressInterval) {
    clearInterval(progressInterval);
    setProgressInterval(null);
  }
  updateProgress('Updating cache (incremental)...');

  console.log('[updateCache] Starting cache update...');

  // Start timer interval
  setProgressInterval(setInterval(() => {
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      const resultsDiv = document.getElementById('results');
      if (resultsDiv) {
        const loadingDiv = resultsDiv.querySelector('.loading');
        if (loadingDiv) {
          const span = loadingDiv.querySelector('span');
          if (span) {
            const text = span.textContent;
            const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
            const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
            span.textContent = `(${message} - ${seconds}s)`;
          }
        }
      }
    }
  }, 1000));

  if (profileIcon) {
    profileIcon.classList.remove('cache-fresh', 'cache-stale');
    profileIcon.style.opacity = '0.5';
    profileIcon.title = 'Updating...';
  }
  if (cacheUpdateBtn) {
    cacheUpdateBtn.disabled = true;
    cacheUpdateBtn.textContent = '⏳ Updating...';
  }

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
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stopReading = false;
    let finalData = null;

    console.log('[updateCache] Starting SSE stream read');

    while (true) {
      if (stopReading) break;
      const { done, value } = await reader.read();
      if (done) {
        console.log('[updateCache] Reader done');
        break;
      }

      console.log('[updateCache] Received chunk:', value.length, 'bytes');
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const msg = line.substring(6);

        try {
          const update = JSON.parse(msg);
          console.log('[updateCache] Received update type:', update.type, 'stage:', update.stage);
          if (update.type === 'progress') {
            displayPartialResults(update, fleets, fleetRentalStatus);
          } else if (update.type === 'complete') {
            console.log('[updateCache] Update complete! Transactions:', update.transactionCount24h, '(limit: 3000 per batch, 3000 max)');
            finalData = update;
            try { await reader.cancel(); } catch {}
            stopReading = true;
            break;
          } else if (update.type === 'error') {
            throw new Error(update.message || 'Unknown error');
          }
        } catch (err) {
          console.error('Error parsing SSE message:', err, msg);
        }
      }
    }

    console.log('[updateCache] Stream ended. finalData present?', !!finalData);

    // Ensure we have final data
    if (!finalData) {
      console.error('[updateCache] No complete data received!');
      throw new Error('Update completed but no final data received');
    }

    // Build rented fleet names set from fleets
    const rentedFleetNames = new Set();
    try {
      fleets.forEach(f => {
        const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
        if (isRented) rentedFleetNames.add(f.callsign);
      });
    } catch (err) {
      console.warn('[updateCache] Could not build rentedFleetNames:', err);
    }

    // Render full results with charts
    console.log('[updateCache] Rendering final results...');
    displayResults(finalData, fleetNames, rentedFleetNames);

    // Update cache tooltip
    updateCacheTooltip(cacheHit, cacheTimestamp);

    // Update cache status icon
    if (profileIcon) {
      profileIcon.classList.remove('cache-stale');
      profileIcon.classList.add('cache-fresh');
      profileIcon.style.opacity = '1';
    }
    // Restore update button state
    if (cacheUpdateBtn) {
      cacheUpdateBtn.disabled = false;
      cacheUpdateBtn.textContent = '⚡ Update Cache';
    }
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
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
    setSidebarVisible(true);
  }
}

export async function wipeAndReload() {
  if (!currentProfileId) return;

  // Proceed without confirmation popup (auto-confirm)

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');

  // Hide tooltip and sidebar
  if (cacheTooltip) cacheTooltip.classList.remove('visible');
  setSidebarVisible(false);

  setAnalysisStartTime(Date.now());
  if (progressInterval) {
    clearInterval(progressInterval);
    setProgressInterval(null);
  }
  updateProgress('Wiping cache and reloading...');

  // Start timer interval
  setProgressInterval(setInterval(() => {
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      const resultsDiv = document.getElementById('results');
      if (resultsDiv) {
        const loadingDiv = resultsDiv.querySelector('.loading');
        if (loadingDiv) {
          const span = loadingDiv.querySelector('span');
          if (span) {
            const text = span.textContent;
            const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
            const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
            span.textContent = `(${message} - ${seconds}s)`;
          }
        }
      }
    }
  }, 1000));

  if (profileIcon) {
    profileIcon.classList.remove('cache-fresh', 'cache-stale');
    profileIcon.style.opacity = '0.5';
    profileIcon.title = 'Wiping cache...';
  }
  if (cacheWipeBtn) {
    cacheWipeBtn.disabled = true;
    cacheWipeBtn.textContent = '⏳ Wiping...';
  }

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
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
    setSidebarVisible(true);
  }
}

export async function refreshAnalysis() {
  if (!currentProfileId) return;

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');

  // Hide tooltip and sidebar during refresh
  if (cacheTooltip) cacheTooltip.classList.remove('visible');
  setSidebarVisible(false);

  setAnalysisStartTime(Date.now());
  if (progressInterval) {
    clearInterval(progressInterval);
    setProgressInterval(null);
  }
  updateProgress('Refreshing fleet data...');

  // Start timer interval for refresh
  setProgressInterval(setInterval(() => {
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      const resultsDiv = document.getElementById('results');
      if (resultsDiv) {
        const loadingDiv = resultsDiv.querySelector('.loading');
        if (loadingDiv) {
          const span = loadingDiv.querySelector('span');
          if (span) {
            const text = span.textContent;
            const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
            const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
            span.textContent = `(${message} - ${seconds}s)`;
          }
        }
      }
    }
  }, 1000));

  if (profileIcon) {
    profileIcon.classList.remove('cache-fresh', 'cache-stale');
    profileIcon.style.opacity = '0.5';
    profileIcon.title = 'Refreshing...';
  }
  if (cacheRefreshBtn) {
    cacheRefreshBtn.disabled = true;
    cacheRefreshBtn.textContent = '⏳ Refreshing...';
  }

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

    // Collect fleet accounts and names
    const allFleetAccounts = [];
    const fleetNames = {};
    const fleetRentalStatus = {};

    fleets.forEach(f => {
      allFleetAccounts.push(f.data.fleetShips);
      allFleetAccounts.push(f.key);
      if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
      if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
      if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);

      fleetNames[f.data.fleetShips] = f.callsign;
      fleetNames[f.key] = f.callsign;
      if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
      if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
      if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;

      const initialRented = !!f.isRented;
      fleetRentalStatus[f.data.fleetShips] = initialRented;
      fleetRentalStatus[f.key] = initialRented;
      if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
      if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
      if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
    });

    const uniqueFleetAccounts = [...new Set(allFleetAccounts)];

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
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stopReading = false;
    let finalData = null;

    console.log('[refreshAnalysis] Starting SSE stream read');

    while (true) {
      if (stopReading) break;
      const { done, value } = await reader.read();
      if (done) {
        console.log('[refreshAnalysis] Reader done');
        break;
      }

      console.log('[refreshAnalysis] Received chunk:', value.length, 'bytes');
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const msg of messages) {
        if (!msg.trim() || !msg.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(msg.substring(6));
          console.log('[refreshAnalysis] SSE message type:', data.type);

          if (data.type === 'progress') {
            // Update progress with partial results
            if (data.feesByFleet) {
              displayPartialResults(data, fleets, fleetRentalStatus);
            }
            const pct = data.percentage || '0';
            const delay = data.currentDelay || '?';
            updateProgress(`${data.message || 'Processing...'} (${pct}% - delay: ${delay}ms)`);
          } else if (data.type === 'complete' || data.walletAddress) {
            console.log('[refreshAnalysis] Received COMPLETE event');
            // Final complete data - use displayResults to show full UI with charts
            finalData = data;
            const processedTxs = data.transactionCount24h || 0;
            const totalSigs = data.totalSignaturesFetched || 0;
            updateProgress(`Refreshed: ${processedTxs}/${totalSigs} transactions`);

            // Update icon to fresh state
            if (profileIcon) {
              profileIcon.classList.remove('cache-stale');
              profileIcon.classList.add('cache-fresh');
              profileIcon.style.opacity = '1';
              profileIcon.title = 'Fresh data. Click to refresh';
              profileIcon.onclick = (e) => {
                e.stopPropagation();
                refreshAnalysis();
              };
            }
            try { await reader.cancel(); } catch {}
            stopReading = true;
            break;
          } else if (data.error) {
            throw new Error(data.error);
          }
        } catch (err) {
          console.error('Error parsing SSE message:', err, msg);
        }
      }
    }

    console.log('[refreshAnalysis] Stream ended. finalData present?', !!finalData);

    // Ensure we have final data before showing sidebar
    if (!finalData) {
      console.error('[refreshAnalysis] No complete data received!');
      throw new Error('Analysis completed but no final data received');
    }

    // Build rented fleet names set from fleets
    const rentedFleetNames = new Set();
    try {
      fleets.forEach(f => {
        const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
        if (isRented) rentedFleetNames.add(f.callsign);
      });
    } catch (err) {
      console.warn('[refreshAnalysis] Could not build rentedFleetNames:', err);
    }

    // Render full results with charts
    console.log('[refreshAnalysis] Rendering final results...');
    displayResults(finalData, fleetNames, rentedFleetNames, fleets);

    // Update cache tooltip
    updateCacheTooltip(cacheHit, cacheTimestamp);

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
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
    setSidebarVisible(true);

    // Restore cache buttons state in case they remained disabled
    try {
      const updateBtn = document.getElementById('cacheUpdateBtn');
      const refreshBtn = document.getElementById('cacheRefreshBtn');
      const wipeBtn = document.getElementById('cacheWipeBtn');
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.textContent = '⚡ Update Cache';
      }
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Force Refresh';
      }
      if (wipeBtn) {
        wipeBtn.disabled = false;
        wipeBtn.textContent = '🗑️ Wipe & Reload';
      }
      const profileIcon = document.getElementById('profileIcon');
      if (profileIcon) profileIcon.style.opacity = '1';
    } catch (e) {
      console.warn('[refreshAnalysis] Could not restore cache button states:', e);
    }
  }
}