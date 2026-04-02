// prune.ts
// Gestione logica prune modulare per pool RPC

import fs from 'fs/promises';
import path from 'path';

const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');

export async function postGetSlot(url: string, timeout: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSlot"
        }),
        signal: controller.signal
      });

      clearTimeout(id);

      return {
        httpCode: response.status,
        data: await response.json().catch(() => ({}))
      };
    } catch (e) {
      return { httpCode: 0, error: e };
    }
  }

export async function pruneEndpoints(criteria: { unhealthy?: boolean, minFailures?: number } = {}): Promise<any[]> {
  const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
  const endpoints = JSON.parse(raw);
  console.log(`[prune] Testing ${endpoints.length} endpoints...`);



  // Chiamate parallele HTTP POST getSlot
  const probes = await Promise.allSettled(endpoints.map(async (ep: any) => {
    try {
      const res = await postGetSlot(ep.url, 4000);

      // Gestione errori HTTP (incluso 429)
      if (res.httpCode !== 200) {
        const reason = res.httpCode === 429 ? "Rate Limited (429)" : `HTTP ${res.httpCode}`;
        console.log(`[prune] ✗ ${ep.name} - ${reason}`);
        return null;
      }

      // Gestione errori interni JSON-RPC (es. nodo non pronto o overload)
      if (res.data?.error) {
        console.log(`[prune] ✗ ${ep.name} RPC Error: ${res.data.error.message}`);
        return null;
      }

      // Se arriviamo qui, abbiamo un numero di slot valido
      if (typeof res.data?.result === 'number') {
        console.log(`[prune] ✓ ${ep.name} (Slot: ${res.data.result})`);
        return ep;
      }

    } catch (e: any) {
      console.log(`[prune] ✗ ${ep.name} Error: ${e.message}`);
    }
    return null;
  }));

  const valid = probes
    .map(p => (p.status === 'fulfilled' && p.value) ? p.value : null)
    .filter(Boolean);

  console.log(`[prune] Valid endpoints: ${valid.length}/${endpoints.length}`);

  // Se nessun endpoint è valido, ritorna l'intero pool invece di un array vuoto
  if (valid.length === 0) {
    console.warn(`[prune] WARNING: No valid endpoints found, returning full pool as fallback`);
    return endpoints;
  }

  return valid;
}

export async function restorePruned(): Promise<any[]> {
  // Stub: in futuro si può mantenere lista pruned e ripristinare
  return pruneEndpoints();
}

export async function getPrunedList(): Promise<any[]> {
  // Stub: in futuro si può mantenere lista pruned
  return [];
}
