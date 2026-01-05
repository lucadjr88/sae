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

export async function refreshAnalysis(): Promise<void> {
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

    console.log('[refreshAnalysis] Fleets structure:', fleets.slice(0, 2));
    const { accounts: uniqueFleetAccounts, names: fleetNames, rentalStatus: fleetRentalStatus } = buildFleetAccountsMap(fleets);
    console.log('[refreshAnalysis] Fleet names:', fleetNames);

    updateProgress('Fetching fresh transaction data...');

    // Validate profileId before making request
    if (!currentProfileId) {
      throw new Error('Profile ID not set');
    }

    console.log('[refreshAnalysis] Sending request with profile:', currentProfileId.substring(0, 8) + '...');

    // Use streaming endpoint with refresh flag
    const response = await fetch('/api/wallet-sage-fees-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        profileId: currentProfileId,
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