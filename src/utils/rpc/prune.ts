// prune.ts
// Gestione logica prune modulare per pool RPC

import fs from 'fs/promises';
import path from 'path';

const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');
const PRUNED_RPC_STATS = path.join(process.cwd(), 'interna_cache', 'pruned_rpc.json');

type PrunedRpcStats = Record<string, string>;
async function postGetSlot(url: string, timeout: number) {
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

async function postGetLatestBlockhash(url: string, timeout: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: [{ commitment: 'confirmed' }]
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

async function readPrunedRpcStats(): Promise<PrunedRpcStats> {
  try {
    const raw = await fs.readFile(PRUNED_RPC_STATS, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as PrunedRpcStats : {};
  } catch {
    return {};
  }
}

function parseCounter(value: unknown): { pruned: number; totali: number } {
  if (typeof value !== 'string') return { pruned: 0, totali: 0 };
  const [prunedRaw, totaliRaw] = value.split('/');
  const pruned = Number.parseInt(prunedRaw ?? '', 10);
  const totali = Number.parseInt(totaliRaw ?? '', 10);
  return {
    pruned: Number.isFinite(pruned) ? pruned : 0,
    totali: Number.isFinite(totali) ? totali : 0,
  };
}

async function updatePrunedRpcStats(endpoints: any[], healthyUrls: Set<string>): Promise<void> {
  const current = await readPrunedRpcStats();
  const next: PrunedRpcStats = { ...current };

  for (const ep of endpoints) {
    const key = typeof ep?.name === 'string' && ep.name.length > 0 ? ep.name : ep?.url;
    if (typeof key !== 'string' || key.length === 0) continue;
    const counters = parseCounter(current[key]);
    const updatedPruned = counters.pruned + (healthyUrls.has(ep.url) ? 1 : 0);
    const updatedTotali = counters.totali + 1;
    next[key] = `${updatedPruned}/${updatedTotali}`;
  }

  await fs.mkdir(path.dirname(PRUNED_RPC_STATS), { recursive: true });
  await fs.writeFile(PRUNED_RPC_STATS, JSON.stringify(next, null, 2), 'utf8');
}

export async function getSingleHealthyRpc(): Promise<string | null> {
  const poolPath = path.resolve('utility/rpc-pool-complete.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const endpoints = JSON.parse(raw);

  // Mischia l'ordine per non martellare sempre lo stesso nodo ad ogni riavvio
  const shuffled = endpoints.sort(() => 0.5 - Math.random());

  for (const ep of shuffled) {
    try {
      // Eseguiamo 3 richieste getSlot in parallelo
      const stressTest = await Promise.all([
        postGetSlot(ep.url, 3000),
        postGetSlot(ep.url, 3000),
        postGetSlot(ep.url, 3000)
      ]);

      // Verifichiamo che TUTTE abbiano avuto successo (HTTP 200 e nessun errore JSON-RPC)
      const isRockSolid = stressTest.every(res => 
        res.httpCode === 200 && !res.data?.error
      );

      if (isRockSolid) {
        console.log(`✅ RPC Valido e Stabile: ${ep.url}`);
        return ep.url;
      } else {
        // Se almeno una fallisce con 429 o timeout, logghiamo lo scarto
        console.warn(`⚠️ RPC instabile o Rate-Limited: ${ep.url}`);
      }
    } catch (err) {
      console.error(`❌ Errore durante il test di ${ep.url}`);
    }
  }

  return null;
}


export async function pruneEndpoints(criteria: { unhealthy?: boolean, minFailures?: number } = {}): Promise<any[]> {
  const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
  const endpoints = JSON.parse(raw);
  console.log(`[prune] Testing ${endpoints.length} endpoints...`);
  // Chiamate parallele HTTP POST getLatestBlockhash
  const probes = await Promise.allSettled(endpoints.map(async (ep: any) => {
    try {
      const probe = await postGetLatestBlockhash(ep.url, 4000);
      const blockhash = probe.data?.result?.value?.blockhash;
      const lastValidBlockHeight = probe.data?.result?.value?.lastValidBlockHeight;
      const isHealthy =
        probe.httpCode === 200 &&
        !probe.data?.error &&
        typeof blockhash === 'string' &&
        typeof lastValidBlockHeight === 'number';

      if (!isHealthy) {
        console.log(`[prune] ✗ ${ep.name} - getLatestBlockhash non affidabile`);
        return null;
      }

      console.log(`[prune] ✓ ${ep.name} (Blockhash: ${blockhash.slice(0, 8)}..., LastValidBlockHeight: ${lastValidBlockHeight})`);
      return ep;

    } catch (e: any) {
      console.log(`[prune] ✗ ${ep.name} Error: ${e.message}`);
    }
    return null;
  }));

  const valid = probes
    .map(p => (p.status === 'fulfilled' && p.value) ? p.value : null)
    .filter(Boolean);

  await updatePrunedRpcStats(endpoints, new Set(valid.map((ep: any) => ep.url)));

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
