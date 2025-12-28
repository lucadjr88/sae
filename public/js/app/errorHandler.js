// Centralized error handling module
// Usage: import { logError, logWarn, logDebug } from './errorHandler.js';

export function logError(message, error) {
    console.error(`[ERROR] ${message}`, error || '');
}

export function logWarn(message, warn) {
    console.warn(`[WARN] ${message}`, warn || '');
}

export function logDebug(message, data) {
    if (window.DEBUG_MODE) {
        console.debug(`[DEBUG] ${message}`, data || '');
    }
}
