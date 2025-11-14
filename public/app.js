// Main application logic for SAGE Fleet Fees Analysis + Market tab

// Global state
let currentProfileId = null;
let analysisStartTime = null;
let progressInterval = null;
let lastAnalysisParams = null; // Store last successful analysis parameters

// Helper to show/hide sidebar
function setSidebarVisible(visible) {
  const sidebar = document.getElementById('sidebar');
  const container = document.querySelector('.container');
  if (sidebar) {
    sidebar.style.display = visible ? 'flex' : 'none';
  }
  if (container) {
    if (visible) {
      container.classList.add('with-sidebar');
    } else {
      container.classList.remove('with-sidebar');
    }
  }
}

// Setup cache button click handlers
document.addEventListener('DOMContentLoaded', () => {
  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');
  
  if (cacheUpdateBtn) {
    cacheUpdateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache update button clicked');
      updateCache();
    });
  }
  
  if (cacheRefreshBtn) {
    cacheRefreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache refresh button clicked');
      refreshAnalysis();
    });
  }
  
  if (cacheWipeBtn) {
    cacheWipeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache wipe button clicked');
      wipeAndReload();
    });
  }
});

// Helper to update progress message
function updateProgress(message) {
  const resultsDiv = document.getElementById('results');
  if (resultsDiv) {
    let elapsed = '';
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      elapsed = ` - ${seconds}s`;
    }
    resultsDiv.innerHTML = `<div class="loading">Processing transaction data, this may take up to 10 minutes depending on your tx/day...<br><span style="font-size:11px; color:#7a8ba0; margin-top:8px; display:block;">(${message}${elapsed})</span></div>`;
  }
}

// Tabs handling
function showFees() {
  document.getElementById('fees-view').style.display = '';
  document.getElementById('market-view').style.display = 'none';
  document.getElementById('tab-fees').classList.add('tab-active');
  document.getElementById('tab-market').classList.remove('tab-active');
}

function showMarket() {
  document.getElementById('fees-view').style.display = 'none';
  document.getElementById('market-view').style.display = '';
  document.getElementById('tab-market').classList.add('tab-active');
  document.getElementById('tab-fees').classList.remove('tab-active');
  if (!marketState._bootstrapped) {
    bootstrapMarket();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const tf = document.getElementById('tab-fees');
  const tm = document.getElementById('tab-market');
  if (tf) tf.addEventListener('click', showFees);
  if (tm) tm.addEventListener('click', showMarket);
});

function displayPartialResults(update, fleets, fleetRentalStatus) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;
  
  // Build partial HTML with available data
  const rentedFleetNames = new Set();
  try {
    fleets.forEach(f => {
      const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
      if (isRented) rentedFleetNames.add(f.callsign);
    });
  } catch {}
  
  // Mark rented fleets in the partial data
  Object.entries(update.feesByFleet || {}).forEach(([name, entry]) => {
    if (rentedFleetNames.has(String(name))) {
      entry.isRented = true;
    }
  });
  
  // Build simplified HTML for partial view
  let html = `
    <div style="opacity: 0.8;">
      <h2>⏳ Analysis in progress... (${update.percentage}%)</h2>
      <div class="summary">
        <div class="summary-item">
          <span class="label">Total Fees:</span>
          <span class="value">${(update.totalFees24h / 1e9).toFixed(6)} SOL</span>
        </div>
        <div class="summary-item">
          <span class="label">SAGE Fees:</span>
          <span class="value">${(update.sageFees24h / 1e9).toFixed(6)} SOL</span>
        </div>
        <div class="summary-item">
          <span class="label">Transactions:</span>
          <span class="value">${update.transactionCount24h || 0}</span>
        </div>
      </div>
  `;
  
  // Show fleet breakdown if available
  if (update.feesByFleet && Object.keys(update.feesByFleet).length > 0) {
    const sortedFleets = Object.entries(update.feesByFleet)
      .sort((a, b) => b[1].totalFee - a[1].totalFee);
    
    html += '<h3>Fleet Breakdown (partial)</h3><div class="fleet-list">';
    
    sortedFleets.forEach(([fleetName, fleetData]) => {
      const isRented = !!fleetData.isRented;
      const nameClass = isRented ? 'rented-name' : '';
      const badge = isRented ? '<span class="rented-badge">RENTED</span>' : '';
      
      html += `
        <div class="fleet-item">
          <div class="fleet-header">
            <span class="fleet-name ${nameClass}">${fleetName}</span>
            ${badge}
            <span class="fleet-fee">${(fleetData.totalFee / 1e9).toFixed(6)} SOL</span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  html += '</div>';
  resultsDiv.innerHTML = html;
}

async function analyzeFees() {
  const profileId = document.getElementById('profileId').value.trim();
  const resultsDiv = document.getElementById('results');
  const btn = document.getElementById('analyzeBtn');
  
  if (!profileId) {
    alert('Inserisci un Player Profile ID!');
    return;
  }
  
  // Store profile ID globally
  currentProfileId = profileId;
  
  // Hide form and sidebar during analysis
  const formBox = document.querySelector('.form-box');
  if (formBox) formBox.style.display = 'none';
  
  setSidebarVisible(false);

  btn.disabled = true;
  btn.textContent = 'Loading...';
  
  analysisStartTime = Date.now();
  updateProgress('Initializing...');
  
  // Update timer every second independently
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      const resultsDiv = document.getElementById('results');
      if (resultsDiv) {
        const loadingDiv = resultsDiv.querySelector('.loading');
        if (loadingDiv) {
          const span = loadingDiv.querySelector('span');
          if (span) {
            // Extract message without time
            const text = span.textContent;
            const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
            const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
            span.textContent = `(${message} - ${seconds}s)`;
          }
        }
      }
    }
  }, 1000);

  try {
    // Get fleets first to derive wallet from transactions (use cache if available)
    updateProgress('Fetching fleet data...');
    console.log('Fetching fleets for profile:', profileId);
    const fleetsResponse = await fetch('/api/fleets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    });
    
    if (!fleetsResponse.ok) {
      throw new Error('Failed to fetch fleets');
    }
    
    const fleetsData = await fleetsResponse.json();
    
    if (!fleetsData.walletAuthority) {
      throw new Error('Could not derive wallet from fleet transactions');
    }
    
    const walletPubkey = fleetsData.walletAuthority;
  const fleets = fleetsData.fleets;
    
    updateProgress(`Found ${fleets.length} fleets, deriving wallet...`);
    console.log('Derived wallet:', walletPubkey);
    console.log('Fleets found:', fleets.length);
    
    // Collect all fleet-related accounts
    updateProgress(`Analyzing ${fleets.length} fleet accounts...`);
    const allFleetAccounts = [];
    const fleetNames = {};
  const fleetRentalStatus = {}; // Track which fleets are rented (from backend)
    
    fleets.forEach(f => {
      // Main accounts
      allFleetAccounts.push(f.data.fleetShips);
      allFleetAccounts.push(f.key);
      
      // Fuel, ammo, cargo
      if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
      if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
      if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
      
      // Map names
      fleetNames[f.data.fleetShips] = f.callsign;
      fleetNames[f.key] = f.callsign;
      if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
      if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
      if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
      
      // Map rental status (backend authoritative flag)
      const initialRented = !!f.isRented;
      fleetRentalStatus[f.data.fleetShips] = initialRented;
      fleetRentalStatus[f.key] = initialRented;
      if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
      if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
      if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
    });

    const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
    console.log('Fleet accounts collected:', uniqueFleetAccounts.length);
    
    // Get detailed fees with streaming updates
    updateProgress(`Analyzing transaction history (limit: 24h or 5000 tx)...`);
    console.log('Starting streaming analysis...');
    
    let data = null;
    let lastProgress = null;
    let fromCache = false;
    
    // Use fetch with streaming response
    const response = await fetch('/api/wallet-sage-fees-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletPubkey, 
        fleetAccounts: uniqueFleetAccounts,
        fleetNames: fleetNames,
        fleetRentalStatus: fleetRentalStatus,
        hours: 24 
      })
    });
    
    if (!response.ok) {
      throw new Error('Streaming request failed');
    }
    
    // Check cache headers
    const cacheHit = response.headers.get('X-Cache-Hit');
    const cacheTimestamp = response.headers.get('X-Cache-Timestamp');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    console.log('[analyzeFees] Started SSE stream consumption');
    let stopReading = false;
    
    while (true) {
      if (stopReading) break;
      const { done, value } = await reader.read();
      
      if (done) break;
      console.log('[analyzeFees] Received chunk bytes:', value.length);
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete messages (SSE format: "data: {...}\n\n")
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // Keep incomplete message in buffer
      
      for (const message of messages) {
        if (!message.trim() || !message.startsWith('data: ')) continue;
        
        const jsonStr = message.substring(6); // Remove "data: " prefix
        try {
          const update = JSON.parse(jsonStr);
          console.log('[analyzeFees] SSE message type:', update.type, 'stage:', update.stage, 'processed:', update.processed, 'total:', update.total);
          
          if (update.type === 'progress') {
            lastProgress = update;
            if (update.stage === 'signatures') {
              updateProgress(`${update.message} (${update.processed}/${update.total})`);
            } else if (update.stage === 'transactions') {
              const msg = `Processing: ${update.processed}/${update.total} tx (${update.percentage}%)`;
              updateProgress(msg);
              
              // Update UI with partial results if available
              if (update.feesByFleet && Object.keys(update.feesByFleet).length > 0) {
                displayPartialResults(update, fleets, fleetRentalStatus);
              }
            }
          } else if (update.type === 'complete') {
            data = update;
            fromCache = !!update.fromCache;
            console.log('[analyzeFees] Received complete payload. Transactions:', data.transactionCount24h, 'Signatures:', data.totalSignaturesFetched);
            // Stop reading further SSE events immediately
            try { await reader.cancel(); } catch {}
            stopReading = true;
            break;
          } else if (update.error) {
            throw new Error(update.error);
          }
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      }
    }
    
    // Fallback: parse any remaining buffer for a final message
    if (!data && buffer.trim()) {
      console.warn('[analyzeFees] No complete received, trying fallback parse of remaining buffer');
      const lines = buffer.split(/\n/).filter(l => l.startsWith('data: '));
      for (const l of lines) {
        try {
          const obj = JSON.parse(l.substring(6));
          if (obj.type === 'complete') {
            data = obj;
            break;
          }
        } catch {}
      }
    }
    // Synthetic completion if still missing but we had progress
    if (!data && lastProgress) {
      console.error('[analyzeFees] Synthesizing final result from last progress update');
      data = {
        ...lastProgress,
        type: 'complete',
        synthetic: true
      };
    }
    if (!data) {
      throw new Error('Analysis failed - no data received');
    }
    console.log('[analyzeFees] Stream finished, data object present');
    
    // Save analysis parameters for future updates
    lastAnalysisParams = {
      walletPubkey,
      fleetAccounts: uniqueFleetAccounts,
      fleetNames,
      fleetRentalStatus,
      fleets
    };
    
    // Show final processing stats
    const totalSigs = data.totalSignaturesFetched || 'N/A';
    const processedTxs = data.transactionCount24h || 0;
    const cacheMsg = fromCache ? ' (from cache)' : '';
    updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions${cacheMsg}`);
    
    // Update icon based on cache status
    const profileIcon = document.getElementById('profileIcon');
    const cacheTooltip = document.getElementById('cacheTooltip');
    const cacheTooltipIcon = document.getElementById('cacheTooltipIcon');
    const cacheTooltipTitle = document.getElementById('cacheTooltipTitle');
    const cacheTooltipStatus = document.getElementById('cacheTooltipStatus');
    const cacheTooltipAge = document.getElementById('cacheTooltipAge');
    
    if (profileIcon && cacheTooltip) {
      profileIcon.classList.remove('cache-fresh', 'cache-stale');
      profileIcon.title = '';
      profileIcon.style.opacity = '1';
      
      // Setup hover behavior for tooltip
      let hideTimeout = null;
      
      profileIcon.onmouseenter = () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
        cacheTooltip.classList.add('visible');
      };
      
      profileIcon.onmouseleave = () => {
        // Delay hiding to allow mouse to move to tooltip
        hideTimeout = setTimeout(() => {
          cacheTooltip.classList.remove('visible');
        }, 200);
      };
      
      cacheTooltip.onmouseenter = () => {
        // Cancel hide if mouse enters tooltip
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      };
      
      cacheTooltip.onmouseleave = () => {
        cacheTooltip.classList.remove('visible');
      };
      
      const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
      const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');
      
      if (cacheHit === 'disk' && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp);
        const sixHoursMs = 6 * 60 * 60 * 1000;
        const ageMinutes = (cacheAge / 60000).toFixed(1);
        const ageHours = (cacheAge / 3600000).toFixed(1);
        
        console.log('Cache age (hours):', (cacheAge / (60 * 60 * 1000)).toFixed(2));
        
        if (cacheAge < sixHoursMs) {
          profileIcon.classList.add('cache-fresh');
          cacheTooltipIcon.textContent = '✅';
          cacheTooltipTitle.textContent = 'Cache Fresh';
          cacheTooltipStatus.textContent = 'Data loaded from cache';
          cacheTooltipAge.textContent = ageHours < 1 ? `Age: ${ageMinutes} minutes` : `Age: ${ageHours} hours`;
          // Show update button for fresh cache
          if (cacheUpdateBtn) cacheUpdateBtn.style.display = '';
          if (cacheRefreshBtn) cacheRefreshBtn.style.display = 'none';
          console.log('Icon: GREEN (fresh cache)');
        } else {
          profileIcon.classList.add('cache-stale');
          cacheTooltipIcon.textContent = '⚠️';
          cacheTooltipTitle.textContent = 'Cache Stale';
          cacheTooltipStatus.textContent = 'Cache is older than 6 hours';
          cacheTooltipAge.textContent = `Age: ${ageHours} hours`;
          // Show refresh button for stale cache
          if (cacheUpdateBtn) cacheUpdateBtn.style.display = 'none';
          if (cacheRefreshBtn) cacheRefreshBtn.style.display = '';
          console.log('Icon: RED (stale cache)');
        }
      } else {
        // Fresh data from API
        profileIcon.classList.add('cache-fresh');
        cacheTooltipIcon.textContent = '✨';
        cacheTooltipTitle.textContent = 'Fresh Data';
        cacheTooltipStatus.textContent = 'Just fetched from API';
        cacheTooltipAge.textContent = 'No cached data';
        // Hide update button, show refresh
        if (cacheUpdateBtn) cacheUpdateBtn.style.display = 'none';
        if (cacheRefreshBtn) cacheRefreshBtn.style.display = '';
        console.log('Icon: GREEN (fresh from API)');
      }
      
      // Re-enable cache buttons
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
    }
    
    console.log('Analysis complete. Transactions:', data.transactionCount24h);
    
    // Collect rented fleet names from fleet list (backend authoritative flags)
    const rentedFleetNames = new Set();
    try {
      fleets.forEach(f => {
        const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
        if (isRented) rentedFleetNames.add(f.callsign);
      });
    } catch {}
    
    console.log('Rented fleets detected from backend:', Array.from(rentedFleetNames));

    // Ensure backend results carry rental flag by fleet name
    // This is critical: feesByFleet may not include all fleets (only those with 24h ops)
    // so we propagate isRented from the fleet list to any matching name in feesByFleet
    try {
      Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
        const isRent = rentedFleetNames.has(String(name)) || rentedFleetNames.has(String(name).trim());
        if (isRent) {
          entry.isRented = true;
        }
      });
    } catch {}

    // Display results
    displayResults(data, fleetNames, rentedFleetNames);
    
    // Show sidebar with profile info
    const sidebar = document.getElementById('sidebar');
    const sidebarProfileId = document.getElementById('sidebarProfileId');
    const container = document.querySelector('.container');
    
    if (sidebar) {
      sidebar.style.display = 'flex';
      if (sidebarProfileId) {
        sidebarProfileId.textContent = profileId.substring(0, 6) + '...';
      }
    }
    if (container) container.classList.add('with-sidebar');
    
  } catch (error) {
    console.error('Analysis error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    btn.disabled = false;
    btn.textContent = 'Analyze 24h';
  }
}

async function updateCache() {
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
  
  analysisStartTime = Date.now();
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  updateProgress('Updating cache (incremental)...');
  
  console.log('[updateCache] Starting cache update...');
  
  // Start timer interval
  progressInterval = setInterval(() => {
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
  }, 1000);
  
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
            console.log('[updateCache] Update complete! Transactions:', update.transactionCount24h);
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
    
    // Update cache status icon
    if (profileIcon) {
      profileIcon.classList.remove('cache-stale');
      profileIcon.classList.add('cache-fresh');
      profileIcon.style.opacity = '1';
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
      progressInterval = null;
    }
    setSidebarVisible(true);
  }
}

async function wipeAndReload() {
  if (!currentProfileId) return;
  
  if (!confirm('This will delete the cache for this profile and reload fresh data. Continue?')) {
    return;
  }
  
  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');
  
  // Hide tooltip and sidebar
  if (cacheTooltip) cacheTooltip.classList.remove('visible');
  setSidebarVisible(false);
  
  analysisStartTime = Date.now();
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  updateProgress('Wiping cache and reloading...');
  
  // Start timer interval
  progressInterval = setInterval(() => {
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
  }, 1000);
  
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
      progressInterval = null;
    }
    setSidebarVisible(true);
  }
}

async function refreshAnalysis() {
  if (!currentProfileId) return;
  
  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheTooltip = document.getElementById('cacheTooltip');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');
  
  // Hide tooltip and sidebar during refresh
  if (cacheTooltip) cacheTooltip.classList.remove('visible');
  setSidebarVisible(false);
  
  analysisStartTime = Date.now();
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  updateProgress('Refreshing fleet data...');
  
  // Start timer interval for refresh
  progressInterval = setInterval(() => {
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
  }, 1000);
  
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
    
    // Use streaming endpoint with refresh flag
    const response = await fetch('/api/wallet-sage-fees-stream?refresh=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletPubkey, 
        fleetAccounts: uniqueFleetAccounts,
        fleetNames: fleetNames,
        fleetRentalStatus: fleetRentalStatus,
        hours: 24,
        refresh: true
      })
    });
    
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
    displayResults(finalData, fleetNames, rentedFleetNames);
    
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
          progressInterval = null;
        }
    setSidebarVisible(true);
  }
}

function displayResults(data, fleetNames, rentedFleetNames = new Set()) {
  console.log('Displaying results...');
  const resultsDiv = document.getElementById('results');
  
  // Prepare data for charts
  const sortedFleets = Object.entries(data.feesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 fleets
  
  const sortedOps = Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 operations
  
  const fleetColors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
  const opColors = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#fbbf24'];
  
  console.log('Top 5 fleets:', sortedFleets.map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  console.log('Top 5 operations:', sortedOps.map(([name, data]) => ({ name, fee: data.totalFee })));
  
  const sageFees24h = data.sageFees24h;
  
  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value">${data.transactionCount24h}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fees</div>
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Fees by Fleet (Top 5)</div>
        <div class="chart-container">
          <canvas id="fleetChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="fleetLegend"></div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Fees by Operation (Top 5)</div>
        <div class="chart-container">
          <canvas id="operationChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="operationLegend"></div>
        </div>
      </div>
    </div>

  <h2 class="section-title">Fleet Breakdown</h2>
    <div id="fleetList"></div>

    <h2 class="section-title">Operations Summary</h2>
    <div id="operationList"></div>
  `;
  
  resultsDiv.innerHTML = html;
  
  // Create fleet list with fold/unfold
  createFleetList(data, fleetNames, rentedFleetNames);
  
  // Create operation list with fold/unfold
  createOperationList(data, fleetNames, rentedFleetNames);

  // No additional labels; rented fleets are highlighted by name only
  
  // Draw pie charts
  drawPieChart('fleetChart', 'fleetLegend', sortedFleets.map(([name, data], index) => ({
    label: fleetNames[name] || name,
    value: data.totalFee,
    count: data.totalOperations,
    percentage: data.feePercentage,
    color: fleetColors[index]
  })));
  
  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data], index) => ({
    label: name,
    value: data.totalFee,
    count: data.count,
    percentage: data.totalFee / (sageFees24h || 1),
    color: opColors[index]
  })));
  
  console.log('Results displayed successfully');
}

function createFleetList(data, fleetNames, rentedFleetNames = new Set()) {
  const fleetListDiv = document.getElementById('fleetList');
  // Normalize rented fleet names for case-insensitive matching
  const rentedLc = new Set(Array.from(rentedFleetNames).map(n => (n || '').toString().toLowerCase()));
  
  // List of category names to exclude from Fleet Breakdown
  const categories = [
    'Crafting Operations',
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
          <div class="fleet-pct">${(fleetData.feePercentage * 100).toFixed(1)}%</div>
          <div class="fleet-sol">${(fleetData.totalFee / 1e9).toFixed(6)} SOL</div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    
    Object.entries(fleetData.operations)
      .sort((a, b) => b[1].totalFee - a[1].totalFee)
      .forEach(([op, stats]) => {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td>${(stats.percentageOfFleet * 100).toFixed(1)}%</td>
          </tr>
        `;
      });
    
    html += `
          </table>
        </div>
      </div>
    `;
  });
  
  fleetListDiv.innerHTML = html;
}

function createOperationList(data, fleetNames, rentedFleetNames = new Set()) {
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
          <div class="fleet-sol">${(opStats.totalFee / 1e9).toFixed(6)} SOL</div>
        </div>
        <div class="fleet-details" id="${opId}">
          <table class="fleet-ops-table">
    `;
    
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
          <td>${(fleet.totalFee / 1e9).toFixed(6)} SOL</td>
          <td>${fleetOpPercentage.toFixed(1)}%</td>
        </tr>
      `;
    });
    
    html += `
          </table>
        </div>
      </div>
    `;
  });
  
  operationListDiv.innerHTML = html;
}

function toggleFleet(fleetId) {
  const fleetItem = document.getElementById(fleetId).parentElement;
  fleetItem.classList.toggle('expanded');
}

function drawPieChart(canvasId, legendId, data) {
  console.log(`Drawing pie chart: ${canvasId}`, data);
  
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById(legendId);
  
  // Set canvas size with higher resolution
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 100 * dpr;
  canvas.height = 100 * dpr;
  canvas.style.width = '100px';
  canvas.style.height = '100px';
  ctx.scale(dpr, dpr);
  
  const centerX = 50;
  const centerY = 50;
  const radius = 45;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  let currentAngle = -Math.PI / 2; // Start at top
  
  // Draw pie slices
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    
    // Add subtle border between slices
    ctx.strokeStyle = '#0b0e1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    currentAngle += sliceAngle;
  });
  
  // Create legend with format: Nome | Ops | % | SOL
  let legendHtml = '<table>';
  data.forEach((item, index) => {
    const percentage = ((item.percentage || item.value / total) * 100).toFixed(1);
    const solValue = (item.value / 1e9).toFixed(6);
    legendHtml += `
      <tr>
        <td><div style="width: 8px; height: 8px; background: ${item.color}; border-radius: 1px;"></div></td>
        <td>${item.label}</td>
        <td>${item.count} ops</td>
        <td>${percentage}%</td>
        <td>${solValue} SOL</td>
      </tr>
    `;
  });
  legendHtml += '</table>';
  legend.innerHTML = legendHtml;
}

// -------------------- Market Tab --------------------

const marketState = {
  items: [],
  marketSummary: null,
  loading: false,
  searchTerm: '',
  filter: 'all',
  sortBy: 'name',
  error: null,
  backendStatus: 'checking',
  _bootstrapped: false
};

function bootstrapMarket() {
  marketState._bootstrapped = true;
  const search = document.getElementById('marketSearch');
  const filter = document.getElementById('marketFilter');
  const sort = document.getElementById('marketSort');
  const refresh = document.getElementById('marketRefreshBtn');
  if (search) search.addEventListener('input', (e) => { marketState.searchTerm = e.target.value; renderMarket(); });
  if (filter) filter.addEventListener('change', (e) => { marketState.filter = e.target.value; renderMarket(); });
  if (sort) sort.addEventListener('change', (e) => { marketState.sortBy = e.target.value; renderMarket(); });
  if (refresh) refresh.addEventListener('click', fetchMarketData);
  checkBackendAndLoad();
}

async function checkBackendAndLoad() {
  try {
    const res = await fetch('/health');
    if (res.ok) {
      marketState.backendStatus = 'connected';
      fetchMarketData();
    } else {
      marketState.backendStatus = 'error';
      marketState.error = 'Backend risponde ma con errore';
      renderMarket();
    }
  } catch (e) {
    marketState.backendStatus = 'offline';
    marketState.error = 'Backend non raggiungibile.';
    renderMarket();
  }
}

async function fetchMarketData() {
  marketState.loading = true; marketState.error = null; renderMarket();
  try {
    const [itemsRes, summaryRes] = await Promise.all([
      fetch('/api/market/items-with-prices'),
      fetch('/api/market/market-summary').catch(() => null)
    ]);
    if (!itemsRes.ok) throw new Error(`HTTP ${itemsRes.status}`);
    marketState.items = await itemsRes.json();
    if (summaryRes && summaryRes.ok) marketState.marketSummary = await summaryRes.json();
    marketState.backendStatus = 'connected';
  } catch (e) {
    marketState.error = e.message || String(e);
    marketState.backendStatus = 'error';
  } finally {
    marketState.loading = false;
    renderMarket();
  }
}

function getFilteredMarketItems() {
  return marketState.items
    .filter(item => {
      const term = (marketState.searchTerm || '').toLowerCase();
      const matches = (item.name || '').toLowerCase().includes(term) || (item.symbol || '').toLowerCase().includes(term);
      if (marketState.filter === 'all') return matches;
      if (marketState.filter === 'resources') return matches && item.itemType === 'resource';
      if (marketState.filter === 'ships') return matches && item.itemType === 'ship';
      if (marketState.filter === 'collectibles') return matches && item.itemType === 'collectible';
      if (marketState.filter === 'with-prices') return matches && item.marketData !== null;
      return matches;
    })
    .sort((a, b) => {
      switch (marketState.sortBy) {
        case 'name': return (a.name || '').localeCompare(b.name || '');
        case 'price-high': return (b.marketData?.midPrice || 0) - (a.marketData?.midPrice || 0);
        case 'price-low': return ((a.marketData?.midPrice ?? Infinity) - (b.marketData?.midPrice ?? Infinity));
        case 'volume': {
          const aVol = (a.marketData?.buyOrderCount || 0) + (a.marketData?.sellOrderCount || 0);
          const bVol = (b.marketData?.buyOrderCount || 0) + (b.marketData?.sellOrderCount || 0);
          return bVol - aVol;
        }
        default: return 0;
      }
    });
}

function renderMarket() {
  const statusEl = document.getElementById('market-status');
  const statsEl = document.getElementById('market-stats');
  const resultsEl = document.getElementById('market-results');
  if (!statusEl || !resultsEl) return;

  // Status
  if (marketState.loading) {
    statusEl.style.display = '';
    statusEl.textContent = 'Loading market data...';
  } else if (marketState.error) {
    statusEl.style.display = '';
    statusEl.textContent = `Error: ${marketState.error}`;
  } else {
    statusEl.style.display = 'none';
  }

  // Stats
  if (marketState.marketSummary) {
    statsEl.style.display = '';
    const s = marketState.marketSummary;
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-value">${(s.totalOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Buy Orders</div><div class="stat-value">${(s.buyOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Sell Orders</div><div class="stat-value">${(s.sellOrders||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">Unique Assets</div><div class="stat-value">${(s.uniqueAssets||0).toLocaleString()}</div></div>
    `;
  } else {
    statsEl.style.display = 'none';
  }

  // Table
  const items = getFilteredMarketItems();
  if (!items.length) {
    resultsEl.innerHTML = marketState.loading ? '' : '<div class="loading">No items for filters.</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Type</th>
          <th>Rarity</th>
          <th class="num">Best Bid</th>
          <th class="num">Best Ask</th>
          <th class="num">Mid Price</th>
          <th class="num">Orders</th>
          <th class="num">Supply</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach(item => {
    const md = item.marketData || {};
    const bid = md.bestBid != null ? Number(md.bestBid).toFixed(4) : '-';
    const ask = md.bestAsk != null ? Number(md.bestAsk).toFixed(4) : '-';
    const mid = md.midPrice != null ? Number(md.midPrice).toFixed(4) : '-';
    const ocount = (md.buyOrderCount || 0) + (md.sellOrderCount || 0);
    html += `
      <tr>
        <td>${item.name || ''}<div style="color:#7a8ba0; font-size:10px;">${item.symbol || ''}</div></td>
        <td>${item.itemType || ''}</td>
        <td>${item.rarity || 'common'}</td>
        <td class="num">${bid}</td>
        <td class="num">${ask}</td>
        <td class="num">${mid}</td>
        <td class="num">${ocount}</td>
        <td class="num">${(item.totalSupply ?? 0).toLocaleString()}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  resultsEl.innerHTML = html;
}
