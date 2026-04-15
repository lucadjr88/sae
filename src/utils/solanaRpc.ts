// Fetch reale delle transazioni Solana per un wallet (mock se manca web3.js)
// Fetch reale delle transazioni Solana per un wallet usando una connessione custom
// Usa getSignaturesForAddress e getTransaction per ricostruire le tx



import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager.js';

type RpcFetchErrorInfo = {
  errorType: '429' | '503' | 'error';
  retryable: boolean;
  maxAttempts: number;
  delayMs: number;
  summary: string;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRpcTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`RPC timeout after ${timeoutMs}ms (${label})`) as Error & { status?: number };
          error.name = 'RpcTimeoutError';
          error.status = 504;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summarizeRpcFetchError(error: unknown): string {
  const name = typeof (error as { name?: unknown })?.name === 'string'
    ? String((error as { name?: string }).name)
    : 'Error';
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const rpcCode = typeof (error as { value?: { error?: { code?: unknown } } })?.value?.error?.code === 'number'
    ? Number((error as { value?: { error?: { code?: number } } }).value?.error?.code)
    : undefined;
  const rpcMessage = typeof (error as { value?: { error?: { message?: unknown } } })?.value?.error?.message === 'string'
    ? String((error as { value?: { error?: { message?: string } } }).value?.error?.message)
    : '';
  const compactMessage = message.split('\n')[0]?.trim() || message;

  if (rpcCode !== undefined) {
    return `${name}: rpcCode=${rpcCode}${rpcMessage ? ` ${rpcMessage}` : ''}`;
  }
  return `${name}: ${compactMessage}`;
}

function classifyRpcFetchError(error: unknown, attempt: number): RpcFetchErrorInfo {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const rpcCode = typeof (error as { value?: { error?: { code?: unknown } } })?.value?.error?.code === 'number'
    ? Number((error as { value?: { error?: { code?: number } } }).value?.error?.code)
    : undefined;
  const rpcMessage = typeof (error as { value?: { error?: { message?: unknown } } })?.value?.error?.message === 'string'
    ? String((error as { value?: { error?: { message?: string } } }).value?.error?.message)
    : '';
  const haystack = `${message} ${rpcMessage}`.toLowerCase();

  if (status === 429 || /429|too many requests/.test(haystack)) {
    const backoffMs = Math.min(60000, 500 * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(backoffMs * 0.5)));
    return {
      errorType: '429',
      retryable: true,
      maxAttempts: 3,
      delayMs: backoffMs + jitter,
      summary: summarizeRpcFetchError(error),
    };
  }

  if (
    status === 503 ||
    status === 504 ||
    /503|504|service unavailable|gateway timeout|gateway time-out|backend not ready|timed out|rpc timeout/.test(haystack)
  ) {
    return {
      errorType: '503',
      retryable: true,
      maxAttempts: 2,
      delayMs: 150 + Math.floor(Math.random() * 250),
      summary: summarizeRpcFetchError(error),
    };
  }

  if (
    status === 403 ||
    /403|forbidden|not available on your current plan|archive, debug and trace requests/.test(haystack)
  ) {
    return {
      errorType: 'error',
      retryable: false,
      maxAttempts: 1,
      delayMs: 0,
      summary: summarizeRpcFetchError(error),
    };
  }

  if (rpcCode === -32603 && (error as { value?: { result?: unknown } })?.value?.result === null) {
    return {
      errorType: '503',
      retryable: true,
      maxAttempts: 2,
      delayMs: 120 + Math.floor(Math.random() * 180),
      summary: summarizeRpcFetchError(error),
    };
  }

  return {
    errorType: 'error',
    retryable: true,
    maxAttempts: 2,
    delayMs: 100 + Math.floor(Math.random() * 200),
    summary: summarizeRpcFetchError(error),
  };
}

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
              pageSigs = await withRpcTimeout(
                connection.getSignaturesForAddress(address, { before }),
                10000,
                `getSignaturesForAddress ${endpoint.url}`,
              );
              release({ success: true, latencyMs: Date.now() - start });
              console.log(`[fetchWalletTransactions] wallet=${pubkey} page=${page} endpoint=${endpoint.url} signaturesTrovate=${pageSigs.length}`);
              last429Delay = 0; // reset se successo
              break;
            } catch (e: any) {
              const retryPlan = classifyRpcFetchError(e, attemptEp + 1);
              release({ success: false, errorType: retryPlan.errorType });
              sigErr = retryPlan.summary;
              if (!retryPlan.retryable) {
                break;
              }
              if (retryPlan.errorType === '429') {
                last429Delay = retryPlan.delayMs;
                process.stdout.write(`${endpoint.url} responded with 429 Too Many Requests.  Retrying after ${last429Delay / 1000}s delay...\n`);
              }
              await sleep(retryPlan.delayMs);
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
        const UNION_FALLBACK_RATIO = 0.8; // sotto questa soglia, forziamo union
        const CROSSCHECK_MAX_MS = 5000; // don't spend more than 5s in cross-check retries

        let checkCount = INITIAL_CHECK;
        const crossCheckStart = Date.now();
        let cross = await crossCheckSignatures(profileId, pubkey, sinceMs, checkCount, 20);
        let intersectionSet = new Set(cross.intersection);
        // Individua endpoint archival (max signature)
        let maxCount = 0;
        for (const info of Object.values(cross.perEndpoint)) {
          if (info.count > maxCount) maxCount = info.count;
        }
        // Log dettagliato e costruisci union solo degli archival
        const archivalEndpoints = [];
        for (const [url, info] of Object.entries(cross.perEndpoint)) {
          const isArchival = info.count === maxCount && maxCount > 0;
          const archivalTag = isArchival ? '[ARCHIVAL]' : '';
          if (isArchival) archivalEndpoints.push(url);
          console.log(`[fetchWalletTransactions] endpoint=${url} signatures=${info.count} ${archivalTag}`);
        }
        // Costruisci union solo tra gli endpoint archival
        let archivalUnion = new Set<string>();
        for (const url of archivalEndpoints) {
          for (const sig of cross.perEndpoint[url].signatures) {
            archivalUnion.add(sig);
          }
        }
        let unionSize = archivalUnion.size;
        const endpointList = archivalEndpoints;
        console.log(`[fetchWalletTransactions] cross-check: archival_endpoints=${endpointList.length} union=${unionSize} intersection=${intersectionSet.size} endpointList=[${endpointList.join(',')}]`);

        // if intersection small relative to union, retry with more endpoints (paginated per-endpoint)
        while (unionSize > 0 && (intersectionSet.size / unionSize) < THRESHOLD_RATIO && checkCount < MAX_CHECK) {
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
          const endpointList2 = Object.keys(cross.perEndpoint);
          console.log(`[fetchWalletTransactions] cross-check(retry): endpoints=${endpointList2.length} union=${unionSize} intersection=${intersectionSet.size} endpointList=[${endpointList2.join(',')}]`);
          await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
        }

        if (intersectionSet.size === 0) {
          console.warn(`[fetchWalletTransactions] cross-check intersection empty for wallet=${pubkey}; proceeding with local fetch result`);
        } else {
          const beforeCount = filtered.length;
          const ratio = intersectionSet.size / Math.max(1, unionSize);
          // Fallback: se intersection troppo piccola, usa union
          if (ratio < UNION_FALLBACK_RATIO) {
            const unionSet = new Set(cross.union);
            const existingMap = new Map(filtered.map(f => [f.signature, f]));
            const unionArr = Array.from(unionSet).map(sig => existingMap.get(sig) || { signature: sig });
            filtered = unionArr;
            console.warn(`[fetchWalletTransactions] intersection ratio ${ratio.toFixed(2)} < ${UNION_FALLBACK_RATIO}; FORCING UNION fallback, size=${filtered.length} for wallet=${pubkey}`);
          } else if (ratio < THRESHOLD_RATIO) {
            const unionSet = new Set(cross.union);
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
    const progressStep = filtered.length <= 10 ? Math.max(1, filtered.length) : Math.max(5, Math.ceil(filtered.length / 4));
    const endpointHits = new Map<string, number>();
    const endpoint429 = new Map<string, number>();
    const batchStats = { processed: 0, succeeded: 0, rateLimited: 0 };
    const bumpCounter = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1);
    const shortEndpoint = (url: string) => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    };
    const logBatchProgress = (force = false) => {
      if (!force && (batchStats.processed === 0 || batchStats.processed % progressStep !== 0)) return;
      const endpointsSummary = Array.from(endpointHits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([url, count]) => `${shortEndpoint(url)}:${count}`)
        .join(', ') || '-';
      const rateLimitSummary = Array.from(endpoint429.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([url, count]) => `${shortEndpoint(url)}:${count}`)
        .join(', ');
      console.log(
        `[fetchWalletTransactions] rpc-batch wallet=${pubkey} progress=${batchStats.processed}/${filtered.length} ok=${batchStats.succeeded} failed=${failed.length} 429=${batchStats.rateLimited} endpoints=[${endpointsSummary}]${rateLimitSummary ? ` 429ByEndpoint=[${rateLimitSummary}]` : ''}`
      );
    };

    console.log(
      `[fetchWalletTransactions] rpc-batch start wallet=${pubkey} signatures=${filtered.length} concurrency=${MAX_CONCURRENT} maxRetries=${maxRetries} poolEndpoints=${endpoints.length}`
    );

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
        bumpCounter(endpointHits, endpoint.url);
        try {
          // Throttle: aggiunge un piccolo delay per rispettare rate limits
          await sleep(Math.random() * INTER_REQUEST_DELAY_MS / 2);
          const fetchedTx: any = await withRpcTimeout(
            connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed'
            }),
            12000,
            `getTransaction ${shortEndpoint(endpoint.url)}`,
          );
          if (fetchedTx) {
            tx = fetchedTx;
            txs.push({ signature: sig.signature, blockTime: sig.blockTime, ...fetchedTx });
            release({ success: true, latencyMs: Date.now() - start });
            break;
          }

          const nullResultError = new Error(`RPC returned null transaction for known signature=${sig.signature}`) as Error & { status?: number };
          nullResultError.name = 'RpcNullTransactionError';
          nullResultError.status = 503;
          lastErr = nullResultError;
          release({ success: false, errorType: '503' });

          const retryPlan = classifyRpcFetchError(nullResultError, attempt);
          if (!retryPlan.retryable || attempt >= Math.min(maxRetries, retryPlan.maxAttempts)) {
            break;
          }
          await sleep(retryPlan.delayMs);
        } catch (e: any) {
          lastErr = e;
          const retryPlan = classifyRpcFetchError(e, attempt);
          release({ success: false, errorType: retryPlan.errorType });
          if (retryPlan.errorType === '429') {
            batchStats.rateLimited++;
            bumpCounter(endpoint429, endpoint.url);
          }
          if (!retryPlan.retryable || attempt >= Math.min(maxRetries, retryPlan.maxAttempts)) {
            break;
          }
          await sleep(retryPlan.delayMs);
        }
      }
      if (!tx) {
        failed.push(sig.signature);
        console.log(`[fetchWalletTransactions] FALLIMENTO signature=${sig.signature} dopo ${attempt} tentativi. Ultimo errore: ${summarizeRpcFetchError(lastErr)}`);
      } else {
        batchStats.succeeded++;
      }
      batchStats.processed++;
      logBatchProgress(batchStats.processed === filtered.length);
    });
    
    await fetchWithLimit(tasks, MAX_CONCURRENT);
    return { txs, total, failed };
  } catch (e: any) {
    console.log('[fetchWalletTransactions] Errore:', e?.message || e);
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
        const pageSigs = await conn.getSignaturesForAddress(address, { before });
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
