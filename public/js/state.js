
// Stato globale
export let currentProfileId = null;
export let analysisStartTime = null;
export let progressInterval = null;
export let lastAnalysisParams = null; // Store last successful analysis parameters
export const txDetailsCache = {}; // Global cache for transaction details

// Funzioni di gestione stato
export function setCurrentProfileId(val) { currentProfileId = val; }
export function setAnalysisStartTime(val) { analysisStartTime = val; }
export function setProgressInterval(val) { progressInterval = val; }
export function setLastAnalysisParams(val) { lastAnalysisParams = val; }
export function clearTxDetailsCache() { for (const k in txDetailsCache) delete txDetailsCache[k]; }
