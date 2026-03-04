
// Stato globale
export let currentProfileId: string | null = null;
export let analysisStartTime: number | null = null;
export let progressInterval: number | null = null;
export let lastAnalysisParams: any = null;
export let connectedWalletPublicKey: string | null = null;
export let connectedWalletIcon: string | null = null;
export const txDetailsCache: Record<string, any> = {};

// Funzioni di gestione stato
export function setCurrentProfileId(val: string | null): void { currentProfileId = val; }
export function setAnalysisStartTime(val: number | null): void { analysisStartTime = val; }
export function setProgressInterval(val: number | null): void { progressInterval = val; }
export function setLastAnalysisParams(val: any): void { lastAnalysisParams = val; }
export function setConnectedWalletPublicKey(val: string | null): void { connectedWalletPublicKey = val; }
export function setConnectedWalletIcon(val: string | null): void { connectedWalletIcon = val; }
