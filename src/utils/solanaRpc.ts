// Fetch reale delle transazioni Solana per un wallet (mock se manca web3.js)
// Fetch reale delle transazioni Solana per un wallet usando una connessione custom
// Usa getSignaturesForAddress e getTransaction per ricostruire le tx



import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager';

// Utility per limitare il parallelismo usando una coda
async function fetchWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<any>[] = [];
  
  for (const task of tasks) {
    const promise = Promise.resolve().then(task).then(result => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });
    results.push(undefined as any);
    executing.push(promise);
    
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  
  await Promise.all(executing);
  return results.filter(r => r !== undefined);
}

// Fetch singolo per signature, round-robin health-aware, retry/fallback per signature
export async function fetchWalletTransactions(pubkey: string, sinceMs: number, profileId: string, onlySignatures?: string[]): Promise<{txs: any[], total: number, failed: string[]}> {
  try {
    const address = new PublicKey(pubkey);
    // Carica pool health-aware
    const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
    const healthy = pool.filter(ep => RpcPoolManager.health.isHealthy(ep.url) && !RpcPoolManager.health.isInBackoff(ep.url));
    const endpoints = healthy.length > 0 ? healthy : pool;
    if (endpoints.length === 0) throw new Error('No available RPC endpoints');

    let filtered: {signature: string, blockTime?: number}[] = [];
    let total = 0;
    if (onlySignatures && onlySignatures.length > 0) {
      // Retry mirato: solo queste signature
      filtered = onlySignatures.map(sig => ({ signature: sig }));
      total = onlySignatures.length;
      console.log(`[fetchWalletTransactions] Retry mirato su ${onlySignatures.length} signature per wallet=${pubkey}`);
    } else {
      // Scarica tutte le signature recenti con paginazione (1000 per chiamata)
      // Iteriamo paginando con `before` finché non troviamo batch più vecchi del cutoff
      const allSignatures: any[] = [];
      let sigErr: any = null;
      let before: string | undefined = undefined;
      const MAX_PAGES = 50; // limite di sicurezza (50*1000 = 50k signature)
      let page = 0;
      while (page < MAX_PAGES) {
        page++;
        let pageSigs: any[] = [];
        const maxSignatureEndpointAttempts = Math.max(3, Math.round(endpoints.length * 1.5)); // aggr: più tentativi
        let last429Delay = 0;
        for (let attemptEp = 0; attemptEp < maxSignatureEndpointAttempts; attemptEp++) {
          try {
            const pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 3000, allowStale: attemptEp > 2 });
            const { connection, endpoint, release } = pick;
            const start = Date.now();
            try {
              pageSigs = await connection.getSignaturesForAddress(address, { limit: 1000, before });
              release({ success: true, latencyMs: Date.now() - start });
              console.log(`[fetchWalletTransactions] wallet=${pubkey} page=${page} endpoint=${endpoint.url} signaturesTrovate=${pageSigs.length}`);
              last429Delay = 0; // reset se successo
              break;
            } catch (e: any) {
              const is429 = e && (e.status === 429 || (e.message && String(e.message).includes('429')));
              release({ success: false, errorType: is429 ? '429' : undefined });
              sigErr = e;
              if (is429) {
                // 429: sleep progressivo + forza endpoint diverso su retry
                last429Delay = Math.min(5000 * Math.pow(2, Math.floor(attemptEp / 2)), 60000); // cap 60s
                const jitter = Math.floor(Math.random() * 2000);
                process.stdout.write(`Server responded with 429 Too Many Requests.  Retrying after ${(last429Delay + jitter) / 1000}s delay...\n`);
                await new Promise(r => setTimeout(r, last429Delay + jitter));
              } else {
                // altri errori: jitter minore
                await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
              }
            }
          } catch (e: any) {
            sigErr = e;
          }
        }

        if (!pageSigs || pageSigs.length === 0) {
          break; // niente più signature
        }

        allSignatures.push(...pageSigs);

        // se l'ultima signature del batch è precedente al cutoff, possiamo fermarci
        const last = pageSigs[pageSigs.length - 1];
        if (last && last.blockTime && (last.blockTime * 1000) < sinceMs) {
          break;
        }

        // se abbiamo ricevuto meno di 1000, non ci sono altre pagine
        if (pageSigs.length < 1000) break;

        // altrimenti paginiamo: il parametro `before` è l'ultima signature ricevuta
        before = pageSigs[pageSigs.length - 1].signature;
      }

      if (allSignatures.length === 0) {
        console.log(`[fetchWalletTransactions] wallet=${pubkey} filteredAfterCutoff=0`);
        if (sigErr) console.log('[fetchWalletTransactions] getSignaturesForAddress error:', sigErr);
      }

      // Filtriamo le signature che rispettano il cutoff
      filtered = allSignatures.filter(sig => sig.blockTime && sig.blockTime * 1000 >= sinceMs);
      total = allSignatures.length;
      console.log(`[fetchWalletTransactions] wallet=${pubkey} totalSignatures=${allSignatures.length} filteredAfterCutoff=${filtered.length}`);
      if (filtered.length === 0) {
        console.log(`[fetchWalletTransactions] Nessuna signature valida dopo cutoff per wallet=${pubkey}`);
        return { txs: [], total: allSignatures.length, failed: [] };
      }

      // Cross-check: interrogiamo più endpoint e confrontiamo l'insieme di signature
      try {
        const INITIAL_CHECK = 3;
        const MAX_CHECK = 7;
        const THRESHOLD_RATIO = 0.90; // se intersection/union < threshold, amplia il controllo
        const CROSSCHECK_MAX_MS = 5000; // don't spend more than 5s in cross-check retries

        let checkCount = INITIAL_CHECK;
        const crossCheckStart = Date.now();
        let cross = await crossCheckSignatures(profileId, pubkey, sinceMs, checkCount, 20);
        let intersectionSet = new Set(cross.intersection);
        let unionSize = cross.union.length;
        console.log(`[fetchWalletTransactions] cross-check: endpoints=${Object.keys(cross.perEndpoint).length} union=${unionSize} intersection=${intersectionSet.size}`);

        // if intersection small relative to union, retry with more endpoints (paginated per-endpoint)
        while (unionSize > 0 && (intersectionSet.size / unionSize) < THRESHOLD_RATIO && checkCount < MAX_CHECK) {
          // break if we've spent too long trying to cross-check
          if (Date.now() - crossCheckStart > CROSSCHECK_MAX_MS) {
            console.warn(`[fetchWalletTransactions] cross-check time budget exceeded (${CROSSCHECK_MAX_MS}ms); aborting further retries`);
            break;
          }
          checkCount = Math.min(MAX_CHECK, checkCount + 2);
          console.log(`[fetchWalletTransactions] intersection ratio ${(intersectionSet.size/unionSize).toFixed(2)} < ${THRESHOLD_RATIO}; retrying cross-check with ${checkCount} endpoints`);
          try {
            cross = await crossCheckSignatures(profileId, pubkey, sinceMs, checkCount, 20);
          } catch (e: any) {
            console.warn('[fetchWalletTransactions] crossCheckSignatures failed during retry:', e?.message || e);
            break;
          }
          intersectionSet = new Set(cross.intersection);
          unionSize = cross.union.length;
          console.log(`[fetchWalletTransactions] cross-check(retry): endpoints=${Object.keys(cross.perEndpoint).length} union=${unionSize} intersection=${intersectionSet.size}`);
          // very small delay between retries to avoid hitting same rate limits
          await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
        }

        if (intersectionSet.size === 0) {
          console.warn(`[fetchWalletTransactions] cross-check intersection empty for wallet=${pubkey}; proceeding with local fetch result`);
          // keep local filtered as-is
        } else {
          const beforeCount = filtered.length;
          const ratio = intersectionSet.size / Math.max(1, unionSize);
          // If intersection is too small, prefer union to maximize saved txs
          if (ratio < THRESHOLD_RATIO) {
            const unionSet = new Set(cross.union);
            // build filtered array from union: preserve blockTime when available
            const existingMap = new Map(filtered.map(f => [f.signature, f]));
            const unionArr = Array.from(unionSet).map(sig => existingMap.get(sig) || { signature: sig });
            filtered = unionArr;
            console.warn(`[fetchWalletTransactions] intersection ratio ${ratio.toFixed(2)} < ${THRESHOLD_RATIO}; using union size=${filtered.length} for wallet=${pubkey}`);
          } else {
            filtered = filtered.filter(sig => intersectionSet.has(sig.signature));
            if (filtered.length !== beforeCount) {
              console.warn(`[fetchWalletTransactions] cross-check reduced signatures from ${beforeCount} to ${filtered.length} for wallet=${pubkey}`);
            } else {
              console.log(`[fetchWalletTransactions] cross-check OK: ${filtered.length} signatures confirmed across endpoints`);
            }
          }
        }
      } catch (e: any) {
        console.warn('[fetchWalletTransactions] cross-check failed:', e?.message || e);
      }
    }

    // Fetch singolo per signature usando RpcPoolManager.pickRpcConnection per ogni tentativo
    // CRUCIALE: limitare a 3-5 per non colpire rate limit (Helius ~10 req/sec)
    const maxRetries = 3;
    const txs: any[] = [];
    const failed: string[] = [];
    const MAX_CONCURRENT = 10; // RIDOTTO da 20 per rispettare rate limit Helius
    const INTER_REQUEST_DELAY_MS = 150; // delay tra richieste per throttling
    
    const tasks = filtered.map(sig => async () => {
      let tx = null;
      let attempt = 0;
      let lastErr: any = null;
      while (attempt < maxRetries && !tx) {
        attempt++;
        let pick: any = null;
        try {
          pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 5000 });
        } catch (e: any) {
          lastErr = e;
          await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
          continue;
        }
        const { connection, endpoint, release } = pick;
        const start = Date.now();
        try {
          // Throttle: aggiunge un piccolo delay per rispettare rate limits
          await new Promise(r => setTimeout(r, Math.random() * INTER_REQUEST_DELAY_MS / 2));
          tx = await connection.getTransaction(sig.signature, { 
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });
          if (tx) {
            txs.push({ signature: sig.signature, blockTime: sig.blockTime, ...tx });
            release({ success: true, latencyMs: Date.now() - start });
            break;
          } else {
            release({ success: false });
          }
        } catch (e: any) {
          lastErr = e;
          const is429 = e && (e.status === 429 || (e.message && String(e.message).includes('429')));
          release({ success: false, errorType: is429 ? '429' : undefined });
          if (is429) {
            const backoffMs = Math.min(60000, 500 * Math.pow(2, attempt - 1));
            const jitter = Math.floor(Math.random() * (backoffMs * 0.5));
            await new Promise(r => setTimeout(r, backoffMs + jitter));
          } else {
            await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
          }
        }
      }
      if (!tx) {
        failed.push(sig.signature);
        console.error(`[fetchWalletTransactions] FALLIMENTO signature=${sig.signature} dopo ${maxRetries} tentativi. Ultimo errore:`, lastErr);
      }
    });
    
    await fetchWithLimit(tasks, MAX_CONCURRENT);
    return { txs, total, failed };
  } catch (e: any) {
    console.error('[fetchWalletTransactions] Errore:', e?.message || e);
    return { txs: [], total: 0, failed: [] };
  }
}

// Cross-check delle signature ottenute da più endpoint del pool
export async function crossCheckSignatures(profileId: string, pubkey: string, sinceMs: number, endpointsToCheck = 3, maxPages = 50): Promise<{perEndpoint: Record<string, {count: number, signatures: string[]}>, intersection: string[], union: string[], differences: Record<string,string[]>}> {
  const address = new PublicKey(pubkey);
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  // Preferisci endpoint healthy
  const healthy = pool.filter(ep => RpcPoolManager.health.isHealthy(ep.url) && !RpcPoolManager.health.isInBackoff(ep.url));
  const candidates = healthy.length > 0 ? healthy : pool;
  const chosen = candidates.slice(0, Math.max(1, Math.min(endpointsToCheck, candidates.length)));

  const perEndpoint: Record<string, {count: number, signatures: string[]}> = {};

  for (const ep of chosen) {
    const conn = new (await import('@solana/web3.js')).Connection(ep.url, { commitment: 'confirmed' });
    const sigs: string[] = [];
    let before: string | undefined = undefined;
    const epStart = Date.now();
    const EP_MAX_MS = 1500; // don't spend more than ~1.5s per endpoint
    for (let page = 0; page < maxPages; page++) {
      if (Date.now() - epStart > EP_MAX_MS) {
        console.warn('[crossCheckSignatures] endpoint time budget exceeded for', ep.url);
        break;
      }
      try {
        const pageSigs = await conn.getSignaturesForAddress(address, { limit: 1000, before });
        if (!pageSigs || pageSigs.length === 0) break;
        // aggiungi solo quelle >= sinceMs
        for (const s of pageSigs) {
          if (s.blockTime && s.blockTime * 1000 >= sinceMs) sigs.push(s.signature);
        }
        if (pageSigs.length < 1000) break;
        const last = pageSigs[pageSigs.length - 1];
        if (last && last.blockTime && (last.blockTime * 1000) < sinceMs) break;
        before = pageSigs[pageSigs.length - 1].signature;
        // small delay to avoid thundering herd across endpoints
        await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
      } catch (e: any) {
        const is429 = e && (e.status === 429 || (e.message && String(e.message).includes('429')));
        if (is429) {
          const delay = 500 + Math.floor(Math.random() * 800);
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          // on other errors, quickly break and record what we have
          console.warn('[crossCheckSignatures] errore su endpoint', ep.url, e?.message || e);
          break;
        }
      }
    }
    perEndpoint[ep.url] = { count: sigs.length, signatures: Array.from(new Set(sigs)) };
  }

  // compute intersection and union
  const endpointLists = Object.values(perEndpoint).map(p => p.signatures);
  const unionSet = new Set<string>();
  for (const list of endpointLists) for (const s of list) unionSet.add(s);
  let intersectionSet = new Set<string>(endpointLists[0] || []);
  for (const list of endpointLists.slice(1)) {
    intersectionSet = new Set(Array.from(intersectionSet).filter(x => list.includes(x)));
  }

  const differences: Record<string, string[]> = {};
  for (const [url, info] of Object.entries(perEndpoint)) {
    const missing = Array.from(unionSet).filter(s => !info.signatures.includes(s));
    differences[url] = missing;
  }

  return { perEndpoint, intersection: Array.from(intersectionSet), union: Array.from(unionSet), differences };
}
