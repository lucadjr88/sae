// Centralized error handling module

export function logError(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error || '');
}

export function logWarn(message: string, warn?: unknown): void {
    console.warn(`[WARN] ${message}`, warn || '');
}

export function logDebug(message: string, data?: unknown): void {
    if (window.DEBUG_MODE) {
        console.debug(`[DEBUG] ${message}`, data || '');
    }
}

