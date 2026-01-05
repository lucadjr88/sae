// @ts-nocheck
// Types for cache storage
type CacheKey = string;

interface CacheEntry<T = unknown> {
  value: T;
  createdAt: number;
  expiresAt?: number;
}

interface PersistedEntry<T = unknown> extends CacheEntry<T> {}

interface Clock {
  now(): number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  get key(index: number): string | null;
  readonly length: number;
}

// TODO: These functions should be defined in this file or extracted to separate modules
// import { startTimer, stopTimer, updateTimerInResults } from './cache/timer-manager.js';
// import { hideCacheTooltipAndSidebar, setCacheIconState, setCacheButtonState, resetAllCacheButtons } from './cache/ui-state.js';
// import { readSSEStream } from './cache/sse-reader.js';
// import { buildFleetAccountsMap, buildRentedFleetNames } from './cache/fleet-processor.js';
// public/js/cache-manager.ts
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, setAnalysisStartTime, setProgressInterval } from '@utils/state.js';
import { updateProgress } from '@utils/ui-helpers.js';
import { displayResults, displayPartialResults } from '../results-display.js';
import { setSidebarVisible } from '@ui/sidebar.js';
import { updateCacheTooltip } from './api.js';

// Stub functions for missing cache utilities
function startTimer(callback: Function): any {
  return setInterval(callback, 1000);
}

function stopTimer(handle: any): void {
  if (handle) clearInterval(handle);
}

function updateTimerInResults(): void {
  // Updates elapsed time display
  const resultsDiv = document.getElementById('results');
  if (resultsDiv && analysisStartTime) {
    const elapsed = Math.floor((Date.now() - analysisStartTime) / 1000);
    const timerEl = resultsDiv.querySelector('.timer');
    if (timerEl) {
      timerEl.textContent = `${elapsed}s`;
    }
  }
}

function hideCacheTooltipAndSidebar(): void {
  const cacheTooltip = document.getElementById('cacheTooltip');
  const sidebar = document.getElementById('sidebar');
  if (cacheTooltip) cacheTooltip.style.display = 'none';
  if (sidebar) sidebar.style.display = 'none';
}

function setCacheIconState(state: string, title?: string): void {
  const profileIcon = document.getElementById('profileIcon');
  if (!profileIcon) return;
  
  const icons = { loading: '⏳', fresh: '✓', stale: '⚠️', error: '✗' };
  profileIcon.textContent = icons[state] || '💾';
  if (title) profileIcon.title = title;
}

function setCacheButtonState(btnId: string, disabled: boolean, text?: string): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement;
  if (!btn) return;
  
  btn.disabled = disabled;
  if (text) btn.textContent = text;
}

function resetAllCacheButtons(): void {
  setCacheButtonState('cacheUpdateBtn', false, '⚡ Update Cache');
  setCacheButtonState('cacheRefreshBtn', false, '🔄 Force Refresh');
  setCacheButtonState('cacheWipeBtn', false, '🗑️ Wipe & Reload');
}

async function readSSEStream(response: Response, handlers: any): Promise<any> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData = null;

  try {
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'complete') {
              finalData = data;
              if (handlers.onComplete) handlers.onComplete(data);
            } else if (data.type === 'progress') {
              if (handlers.onProgress) handlers.onProgress(data);
            } else if (data.type === 'error' && handlers.onError) {
              handlers.onError(data);
            }
          } catch (e) {
            console.error('Error parsing SSE:', e);
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

function buildFleetAccountsMap(fleets: any[]): { accounts: string[], names: Record<string, string>, rentalStatus: Record<string, any> } {
  const accounts: string[] = [];
  const names: Record<string, string> = {};
  const rentalStatus: Record<string, any> = {};

  for (const fleet of fleets || []) {
    if (fleet.fleetId) {
      accounts.push(fleet.fleetId);
      names[fleet.fleetId] = fleet.fleetName || fleet.fleetId;
      rentalStatus[fleet.fleetId] = { isRented: fleet.isRented || false };
    }
  }

  return { accounts, names, rentalStatus };
}

function buildRentedFleetNames(fleets: any[], fleetRentalStatus: any): string[] {
  const rentedNames: string[] = [];
  for (const fleet of fleets || []) {
    if (fleetRentalStatus?.[fleet.fleetId]?.isRented) {
      rentedNames.push(fleet.fleetName || fleet.fleetId);
    }
  }
  return rentedNames;
}

export async function updateCache(): Promise<void> {
  if (!currentProfileId) return;

  let timerHandle = null;

  if (!lastAnalysisParams) {
    alert('No previous analysis found. Please run "Analyze 24h" first.');
    return;
  }

  const resultsDiv = document.getElementById('results');
  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Updating cache (incremental)...');
  console.log('[updateCache] Starting cache update...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheButtonState('cacheUpdateBtn', true, '⏳ Updating...');

  try {
    // Use saved parameters from last analysis
    const { profileId, fleetAccounts, fleetNames, fleetRentalStatus, fleets } = lastAnalysisParams;

    console.log('Updating cache for profile:', currentProfileId);
    console.log('Using saved parameters:', {
      profileId: profileId.substring(0, 8) + '...',
      fleetCount: fleetAccounts.length
    });

    // Call streaming endpoint with update=true flag
    const response = await fetch('/api/wallet-sage-fees-stream?update=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
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

export async function wipeAndReload(): Promise<void> {
  if (!currentProfileId) return;

  let timerHandle = null;

  const resultsDiv = document.getElementById('results');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Wiping cache...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheButtonState('cacheWipeBtn', true, '⏳ Wiping...');

  try {
    // Call wipe endpoint to delete entire cache folder
    console.log('Wiping cache for profile:', currentProfileId);
    const wipeResponse = await fetch('/api/cache/wipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: currentProfileId })
    });

    if (!wipeResponse.ok) {
      throw new Error('Failed to wipe cache');
    }

    console.log('Cache wiped, refetching fleet data...');
    updateProgress('Fetching fleet data...');

    // Refetch fleets from scratch (like analyzeFees does)
    const fleetsResponse = await fetch('/api/fleets', {
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

    updateProgress(`Found ${fleets.length} fleets, analyzing...`);

    // Build fleet accounts like analyzeFees does
    const allFleetAccounts: string[] = [];
    const fleetNames: { [account: string]: string } = {};
    const fleetRentalStatus: { [account: string]: boolean } = {};

    fleets.forEach((f: any) => {
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

    updateProgress(`Analyzing ${fleets.length} fleet accounts...`);

    // Call streaming endpoint (like analyzeFees)
    const response = await fetch('/api/wallet-sage-fees-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        fleetAccounts: uniqueFleetAccounts,
        fleetNames,
        fleetRentalStatus,
        hours: 24,
        enableSubAccountMapping: false
      })
    });

    if (!response.ok) {
      throw new Error('Streaming request failed');
    }

    const cacheHit = response.headers.get('X-Cache-Hit');
    const cacheTimestamp = response.headers.get('X-Cache-Timestamp');

    // Process SSE stream (like analyzeFees)
    const finalData = await readSSEStream(response, {
      onProgress: (data) => {
        if (data.stage === 'signatures') {
          updateProgress(`${data.message} (${data.processed}/${data.total})`);
        } else if (data.stage === 'transactions') {
          const msg = `Processing: ${data.processed}/${data.total} tx (${data.percentage}%)`;
          updateProgress(msg);
          if (data.feesByFleet && Object.keys(data.feesByFleet).length > 0) {
            displayPartialResults(data, fleets, fleetRentalStatus);
          }
        }
      },
      onComplete: (data) => {
        console.log('[wipeAndReload] Complete! Txs:', data.transactionCount24h);
        const totalSigs = data.totalSignaturesFetched || 'N/A';
        const processedTxs = data.transactionCount24h || 0;
        updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions`);
      },
      onError: null
    });

    console.log('[wipeAndReload] Stream ended. finalData present?', !!finalData);

    // Build rented fleet names
    const rentedFleetNames = new Set();
    fleets.forEach((f: any) => {
      const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
      if (isRented) rentedFleetNames.add(f.callsign);
    });

    // Mark rented entries
    Object.entries(finalData.feesByFleet || {}).forEach(([name, entry]: [string, any]) => {
      const isRent = rentedFleetNames.has(String(name)) || rentedFleetNames.has(String(name).trim());
      if (isRent) { entry.isRented = true; }
    });

    // Render full results
    console.log('[wipeAndReload] Rendering final results...');
    displayResults(finalData, fleetNames, rentedFleetNames);

    // Update cache tooltip
    updateCacheTooltip(cacheHit, cacheTimestamp);

    setCacheButtonState('cacheWipeBtn', false, '🗑️ Wipe & Reload');
    
    // Show sidebar
    setSidebarVisible(true);
    const sidebarProfileId = document.getElementById('sidebarProfileId');
    if (sidebarProfileId) {
      sidebarProfileId.textContent = currentProfileId.substring(0, 6) + '...';
    }

    const sidebar = document.getElementById('sidebar');
    const container = document.querySelector('.container');
    if (sidebar) {
      sidebar.style.display = 'flex';
    }
    if (container) container.classList.add('with-sidebar');

    // Load detailed fleet breakdown for pie charts (async, non-blocking)
    try {
      const breakdownPayload = {
        profileId: currentProfileId,
        fleetAccounts: uniqueFleetAccounts,
        fleetNames,
        fleetRentalStatus,
        enableSubAccountMapping: false
      };
      await fetch('/api/debug/fleet-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(breakdownPayload)
      });
    } catch (e) {
      console.warn('Fleet breakdown not available', e);
    }

  } catch (error) {
    console.error('Wipe error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
    setSidebarVisible(true);
    resetAllCacheButtons();
    setSidebarVisible(true);
  }
}

export async function refreshAnalysis(): Promise<void> {
  if (!currentProfileId) return;

  let timerHandle = null;

  if (!lastAnalysisParams) {
    alert('No previous analysis found. Please run "Analyze 24h" first.');
    return;
  }

  const resultsDiv = document.getElementById('results');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');

  hideCacheTooltipAndSidebar();

  updateProgress('Refreshing cache (incremental)...');
  
  timerHandle = startTimer(updateTimerInResults);

  setCacheButtonState('cacheRefreshBtn', true, '⏳ Refreshing...');

  try {
    // Use saved parameters from last analysis
    const { profileId, fleetAccounts, fleetNames, fleetRentalStatus, fleets } = lastAnalysisParams;

    console.log('[refreshAnalysis] Refreshing with saved parameters for profile:', currentProfileId.substring(0, 8) + '...');
    console.log('[refreshAnalysis] Using:', {
      profileId: profileId.substring(0, 8) + '...',
      fleetCount: fleetAccounts.length
    });

    // Call streaming endpoint with update=true flag (incremental analysis)
    const response = await fetch('/api/wallet-sage-fees-stream?update=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        fleetAccounts,
        fleetNames,
        fleetRentalStatus,
        hours: 24,
        update: true,
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
    displayResults(finalData, fleetNames, rentedFleetNames);

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
    stopTimer(timerHandle);
    resetAllCacheButtons();
  }
}