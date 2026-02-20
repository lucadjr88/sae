// @ts-nocheck
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
import { currentProfileId, analysisStartTime, progressInterval, lastAnalysisParams, setAnalysisStartTime, setProgressInterval, setLastAnalysisParams } from '@utils/state';
import { updateProgress } from '@utils/ui-helpers';
import { displayResults, displayPartialResults } from '../results-display';
import { setSidebarVisible } from '@ui/sidebar';
import { updateCacheTooltip, processAnalysisData } from './api';

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
  // Only two visual states supported:
  // - 'loading' -> hourglass (⏳)
  // - default/other -> user icon (👤)
  if (state === 'loading') {
    profileIcon.textContent = '⏳';
    if (title) profileIcon.title = title;
  } else {
    profileIcon.textContent = '👤';
    profileIcon.title = title || '';
  }
}

function setCacheButtonState(btnId: string, disabled: boolean, text?: string): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement;
  if (!btn) return;

  btn.disabled = disabled;
  if (text) btn.textContent = text;
}

function resetAllCacheButtons(): void {
  setCacheButtonState('cacheUpdateBtn', false);
  setCacheButtonState('cacheWipeBtn', false);
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

function buildFleetAccountsMap(fleets: any[]): Map<string, any> {
  const map = new Map();
  for (const fleet of fleets || []) {
    if (fleet.fleetId) {
      map.set(fleet.fleetId, fleet);
    }
  }
  return map;
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
  setCacheButtonState('cacheUpdateBtn', true);

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

    setCacheIconState('default');
    setCacheButtonState('cacheUpdateBtn', false);
    // Sidebar profile update removed

  } catch (error) {
    console.error('Update error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    stopTimer(timerHandle);
  }
}

export async function wipeAndReload(): Promise<void> {
  console.log('[wipeAndReload] called. currentProfileId:', currentProfileId);
  if (!currentProfileId) {
    console.warn('[wipeAndReload] currentProfileId is null/undefined, aborting wipe.');
    return;
  }

  let timerHandle = null;
  console.log('[wipeAndReload] Proceeding with wipe for profile:', currentProfileId);

  // Proceed without confirmation popup (auto-confirm)

  const resultsDiv = document.getElementById('results');
  const profileIcon = document.getElementById('profileIcon');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');
  console.log('[wipeAndReload] DOM elements:', {resultsDiv, profileIcon, cacheWipeBtn});

  console.log('[wipeAndReload] Hiding cache tooltip and sidebar');
  hideCacheTooltipAndSidebar();

  updateProgress('Wiping cache and reloading...');
  console.log('[wipeAndReload] Progress updated: Wiping cache and reloading...');

  setAnalysisStartTime(Date.now());
  // Uniforma la schermata di attesa: timer e messaggio
  setAnalysisStartTime(Date.now());
  const startTime = Date.now();
  const timerEl = resultsDiv?.querySelector('.timer');
  if (timerEl) {
    timerEl.textContent = '0s';
    timerEl.style.display = '';
  }
  if (progressInterval) clearInterval(progressInterval);
  setProgressInterval(setInterval(() => {
    if (startTime) {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
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
  updateProgress('Analyzing profile (this may take a while)...');
  console.log('[wipeAndReload] Timer started');

  setCacheIconState('loading', 'Wiping cache...');
  setCacheButtonState('cacheWipeBtn', true);
  console.log('[wipeAndReload] Cache icon and button state set to loading');

  try {
    // Chiamata POST identica a analyze, con wipeCache
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Wipe operation timed out (5min)')), 300000)
    );
    const fetchPromise = fetch('/api/analyze-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        wipeCache: true
      })
    });
    const wipeResponse = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    if (!wipeResponse.ok) {
      throw new Error('Failed to wipe cache and reload');
    }
    const cacheHit = wipeResponse.headers.get('X-Cache-Hit');
    const cacheTimestamp = wipeResponse.headers.get('X-Cache-Timestamp');
    const data = await wipeResponse.json();
    const processed = processAnalysisData(data);
    setLastAnalysisParams({
      walletPubkey: processed.walletPubkey,
      fleetAccounts: processed.uniqueFleetAccounts,
      fleetNames: processed.fleetNames,
      fleetRentalStatus: processed.fleetRentalStatus,
      fleets: processed.fleets
    });
    try {
      Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
        const isRent = processed.rentedFleetNames.has(String(name)) || processed.rentedFleetNames.has(String(name).trim());
        if (isRent) { entry.isRented = true; }
      });
    } catch (err) {
      console.warn('[wipeAndReload] Error marking rented fleets:', err);
    }
    updateProgress('Complete!');
    updateCacheTooltip(cacheHit, cacheTimestamp);
    displayResults(data, processed.fleetNames, processed.rentedFleetNames, processed.fleets);
    setCacheIconState('default');
    setCacheButtonState('cacheWipeBtn', false);
    if (progressInterval) clearInterval(progressInterval);
    if (timerEl) timerEl.style.display = 'none';
    console.log('[wipeAndReload] Done.');
  } catch (err) {
    setCacheIconState('error');
    setCacheButtonState('cacheWipeBtn', false);
    if (progressInterval) clearInterval(progressInterval);
    if (timerEl) timerEl.style.display = 'none';
    updateProgress('Error during wipe: ' + (err?.message || err));
    console.error('[wipeAndReload] Error:', err);
  }
}