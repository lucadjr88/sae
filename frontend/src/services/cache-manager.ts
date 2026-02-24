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

export async function wipeAndReload(): Promise<void> {
  // Unifica la logica: chiama analyzeFees con wipeCache: true
  await analyzeFees(currentProfileId, true);
}
