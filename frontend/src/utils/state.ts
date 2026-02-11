
// Stato globale
export let currentProfileId: string | null = null;
export let analysisStartTime: number | null = null;
export let progressInterval: NodeJS.Timeout | null = null;
export let lastAnalysisParams: any = null; // Store last successful analysis parameters
export const txDetailsCache: Record<string, any> = {}; // Global cache for transaction details

// Funzioni di gestione stato
export function setCurrentProfileId(val: string | null): void { currentProfileId = val; }
export function setAnalysisStartTime(val: number | null): void { analysisStartTime = val; }
export function setProgressInterval(val: NodeJS.Timeout | null): void { progressInterval = val; }
export function setLastAnalysisParams(val: any): void { lastAnalysisParams = val; }
export function clearTxDetailsCache(): void { for (const k in txDetailsCache) delete txDetailsCache[k]; }

