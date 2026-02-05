// concurrency-manager.ts
// Gestisce limiti di concorrenza per endpoint RPC
const concurrencyMap = {};
export function canAcquire(url) {
    const meta = concurrencyMap[url];
    if (!meta)
        return true;
    return meta.current < meta.maxConcurrent;
}
export function acquire(url, defaultMax = 2) {
    if (!concurrencyMap[url])
        concurrencyMap[url] = { maxConcurrent: defaultMax, current: 0 };
    if (concurrencyMap[url].current < concurrencyMap[url].maxConcurrent) {
        concurrencyMap[url].current++;
        return true;
    }
    return false;
}
export function release(url) {
    if (concurrencyMap[url] && concurrencyMap[url].current > 0)
        concurrencyMap[url].current--;
}
export function increaseMaxConcurrent(url) {
    if (!concurrencyMap[url])
        concurrencyMap[url] = { maxConcurrent: 2, current: 0 };
    // cap max concurrency to avoid overwhelming a single endpoint
    if (concurrencyMap[url].maxConcurrent < 6)
        concurrencyMap[url].maxConcurrent++;
}
export function decreaseMaxConcurrent(url) {
    if (!concurrencyMap[url])
        concurrencyMap[url] = { maxConcurrent: 2, current: 0 };
    if (concurrencyMap[url].maxConcurrent > 1)
        concurrencyMap[url].maxConcurrent--;
}
export function getConcurrencyMeta(url) {
    return concurrencyMap[url];
}
