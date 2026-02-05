// health-manager.ts
// Gestisce lo stato di health/backoff per endpoint RPC
const healthMap = {};
export function recordFailure(url) {
    const now = Date.now();
    if (!healthMap[url])
        healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0 };
    healthMap[url].failures++;
    healthMap[url].lastFailure = now;
    // Backoff esponenziale
    healthMap[url].backoffUntil = now + Math.min(60000, 1000 * Math.pow(2, healthMap[url].failures));
}
export function recordSuccess(url) {
    const now = Date.now();
    if (!healthMap[url])
        healthMap[url] = { failures: 0, successes: 0, lastFailure: 0, lastSuccess: 0, backoffUntil: 0 };
    healthMap[url].successes++;
    healthMap[url].lastSuccess = now;
    healthMap[url].failures = 0;
    healthMap[url].backoffUntil = 0;
}
export function isHealthy(url) {
    const meta = healthMap[url];
    if (!meta)
        return true;
    return Date.now() > meta.backoffUntil;
}
export function isInBackoff(url) {
    const meta = healthMap[url];
    if (!meta)
        return false;
    return Date.now() < meta.backoffUntil;
}
export function getHealthMeta(url) {
    return healthMap[url];
}
