// prune.ts
// Gestione logica prune modulare per pool RPC
import fs from 'fs/promises';
import path from 'path';
const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');
async function postGetVersion(url, timeoutMs = 5000) {
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('global fetch not available in this Node runtime');
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion', params: [] }),
            signal: controller.signal,
        });
        const text = await res.text();
        return { httpCode: res.status, body: text };
    }
    finally {
        clearTimeout(id);
    }
}
export async function pruneEndpoints(criteria = {}) {
    const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
    const endpoints = JSON.parse(raw);
    // Chiamate parallele HTTP POST getVersion
    const probes = await Promise.allSettled(endpoints.map(async (ep) => {
        try {
            const res = await postGetVersion(ep.url, 4000);
            if (res.httpCode === 200)
                return ep;
        }
        catch { }
        return null;
    }));
    return probes.map(p => (p.status === 'fulfilled' && p.value) ? p.value : null).filter(Boolean);
}
export async function restorePruned() {
    // Stub: in futuro si può mantenere lista pruned e ripristinare
    return pruneEndpoints();
}
export async function getPrunedList() {
    // Stub: in futuro si può mantenere lista pruned
    return [];
}
