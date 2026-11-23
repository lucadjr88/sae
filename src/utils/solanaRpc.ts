// Fetch reale delle transazioni Solana per un wallet (mock se manca web3.js)
// Fetch reale delle transazioni Solana per un wallet usando una connessione custom
// Usa getSignaturesForAddress e getTransaction per ricostruire le tx



import { PublicKey } from '@solana/web3.js';
import { RpcPoolManager } from './rpc/rpc-pool-manager.js';
import { getRpcConnectionWithUrl } from './rpc/connection.js';
import { cacheWalletTransaction, getCachedWalletTransaction } from './fetchAndCacheWalletTxs.js';
import { fetchTransactionBatch, providerRate, recordBatchOutcome, transactionBatchSize } from './rpc/wallet-transaction-batch.js';

type RpcFetchErrorInfo = {
  errorType: '403' | '429' | '503' | 'error';
  retryable: boolean;
  maxAttempts: number;
  delayMs: number;
  summary: string;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRpcTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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
  const compactMessage = (message.split('\n')[0]?.trim() || message).replace(/https?:\/\/\S+/g, '<rpc-url>');

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

  if (status === 429 || (error as { code?: unknown })?.code === 429 || /429|too many requests/.test(haystack)) {
    const backoffMs = Math.min(60000, 500 * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(backoffMs * 0.5)));
    return {
      errorType: '429',
      retryable: true,
      maxAttempts: 5,
      delayMs: backoffMs + jitter,
      summary: summarizeRpcFetchError(error),
    };
  }

  if (
    status === 503 ||
    status === 504 ||
    /503|504|service unavailable|gateway timeout|gateway time-out|backend not ready|timed out|rpc timeout|aborted/.test(haystack)
  ) {
    return {
      errorType: '503',
      retryable: true,
      maxAttempts: 5,
      delayMs: 150 + Math.floor(Math.random() * 250),
      summary: summarizeRpcFetchError(error),
    };
  }

  if (
    status === 401 || status === 402 || status === 403 ||
    /401|402|403|unauthorized|forbidden|invalid api.?key|insufficient credits|paid.plan.required|not available on your current plan|archive, debug and trace requests/.test(haystack)
  ) {
    return {
      errorType: '403',
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
      maxAttempts: 5,
      delayMs: 120 + Math.floor(Math.random() * 180),
      summary: summarizeRpcFetchError(error),
    };
  }

  return {
    errorType: 'error',
    retryable: true,
    maxAttempts: 5,
    delayMs: 100 + Math.floor(Math.random() * 200),
    summary: summarizeRpcFetchError(error),
  };
}

function walletFetchFailureCategory(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  if (status === 429 || code === '429' || /429|too many requests/.test(message)) return 'rate-limit';
  if (status === 401 || /401|unauthorized|invalid api.?key/.test(message)) return 'authentication';
  if (status === 402 || /402|insufficient credits|paid.plan.required/.test(message)) return 'payment';
  if (status === 403 || /403|forbidden/.test(message)) return 'forbidden';
  if (/enotfound|eai_again|getaddrinfo/.test(`${code} ${message}`)) return 'dns';
  if (/null transaction|transaction not available/.test(message)) return 'unavailable';
  if (/aborted|timed out|timeout/.test(message)) return 'timeout';
  if (/econn|premature close|socket|fetch failed/.test(`${code} ${message}`)) return 'transport';
  return 'rpc-error';
}

// Utility per limitare il parallelismo usando una coda
async function fetchWithLimit(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (!failed && next < tasks.length) {
      const task = tasks[next++];
      try {
        await task();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw failure;
}

// Fetch singolo per signature, round-robin health-aware, retry/fallback per signature
export async function fetchWalletTransactions(pubkey: string, sinceMs: number, profileId: string, onlySignatures?: string[], cacheTransactions = false): Promise<{txs: any[], total: number, failed: string[]}> {
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
      const seenCursors = new Set<string>();
      const MAX_PAGES = 50; // limite di sicurezza (50*1000 = 50k signature)
      let page = 0;
      let paginationComplete = false;
      while (page < MAX_PAGES) {
        page++;
        let pageSigs: any[] = [];
        let pageSucceeded = false;
        const failedEndpoints = new Set<string>();
        const maxSignatureEndpointAttempts = Math.max(3, Math.round(endpoints.length * 1.5)); // aggr: più tentativi
        for (let attemptEp = 0; attemptEp < maxSignatureEndpointAttempts; attemptEp++) {
          try {
            const pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: 3000, allowStale: attemptEp > 2, excludeUrls: failedEndpoints, disableRetryOnRateLimit: true });
            const { connection, endpoint, release } = pick;
            const start = Date.now();
            try {
              pageSigs = await withRpcTimeout(
                connection.getSignaturesForAddress(address, { before }),
                10000,
                `getSignaturesForAddress ${endpoint.url}`,
              );
              release({ success: true, latencyMs: Date.now() - start });
              pageSucceeded = true;
              console.log(`[fetchWalletTransactions] wallet=${pubkey} page=${page} endpoint=${endpoint.url} signaturesTrovate=${pageSigs.length}`);
              break;
            } catch (e: any) {
              const retryPlan = classifyRpcFetchError(e, attemptEp + 1);
              release({ success: false, errorType: retryPlan.errorType });
              if (typeof endpoint.url === 'string') failedEndpoints.add(endpoint.url);
              sigErr = retryPlan.summary;
              console.warn(`[fetchWalletTransactions] signature page=${page} endpoint=${new URL(endpoint.url).host} attempt=${attemptEp + 1} failed: ${retryPlan.summary}`);
              if (retryPlan.errorType === '429') {
                console.warn('[fetchWalletTransactions] Signature RPC rate-limited; trying another available endpoint');
              } else {
                await sleep(retryPlan.delayMs);
              }
            }
          } catch (e: any) {
            sigErr = e;
          }
        }

        if (!pageSucceeded) {
          throw new Error(`getSignaturesForAddress failed for wallet ${pubkey} on page ${page}: ${String(sigErr ?? 'No available RPC endpoint').replace(/https?:\/\/\S+/g, '<rpc-url>')}`);
        }
        if (!pageSigs || pageSigs.length === 0) {
          paginationComplete = true;
          break;
        }

        allSignatures.push(...pageSigs);

        // se l'ultima signature del batch è precedente al cutoff, possiamo fermarci
        const last = pageSigs[pageSigs.length - 1];
        if (last && last.blockTime && (last.blockTime * 1000) < sinceMs) {
          paginationComplete = true;
          break;
        }

        const nextCursor = pageSigs[pageSigs.length - 1].signature;
        if (!nextCursor || seenCursors.has(nextCursor)) {
          throw new Error(`getSignaturesForAddress returned a repeated or missing cursor for wallet ${pubkey} on page ${page}`);
        }
        seenCursors.add(nextCursor);
        before = nextCursor;
      }

      if (page === MAX_PAGES && !paginationComplete) {
        throw new Error(`Signature history incomplete for wallet ${pubkey}: page limit reached`);
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
        const crossSignatures = new Set(cross.union);
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

        while (unionSize > 0 && (intersectionSet.size / unionSize) < THRESHOLD_RATIO && checkCount < MAX_CHECK) {
          if (Date.now() - crossCheckStart > CROSSCHECK_MAX_MS) {
            console.warn(`[fetchWalletTransactions] cross-check time budget exceeded (${CROSSCHECK_MAX_MS}ms); aborting further retries`);
            break;
          }
          checkCount = Math.min(MAX_CHECK, checkCount + 2);
          console.log(`[fetchWalletTransactions] intersection ratio ${(intersectionSet.size/unionSize).toFixed(2)} < ${THRESHOLD_RATIO}; retrying cross-check with ${checkCount} endpoints`);
          try {
            cross = await crossCheckSignatures(profileId, pubkey, sinceMs, checkCount, 20);
            for (const signature of cross.union) crossSignatures.add(signature);
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

        const existing = new Map(filtered.map(entry => [entry.signature, entry]));
        for (const signature of crossSignatures) {
          if (!existing.has(signature)) existing.set(signature, { signature });
        }
        const added = existing.size - filtered.length;
        filtered = Array.from(existing.values());
        total = Math.max(total, filtered.length);
        console.log(`[fetchWalletTransactions] cross-check added ${added} signatures; total=${filtered.length} for wallet=${pubkey}`);
      } catch (e: any) {
        console.warn('[fetchWalletTransactions] cross-check failed:', e?.message || e);
      }
    }

    // Fetch in piccoli batch usando RpcPoolManager per ogni tentativo.
    const maxRetries = 5;
    const txs: any[] = [];
    const failed: string[] = [];
    const MAX_CONCURRENT = Math.min(25, Math.max(10, endpoints.length * 3));
    // Cover the RPC pool's longest 429/503 backoff without bypassing health or concurrency limits.
    const RPC_POOL_WAIT_MS = 125_000;
    let poolUnavailable = false;
    const progressStep = Math.max(1, Math.min(50, Math.ceil(filtered.length / 4)));
    const batchStart = Date.now();
    const endpointHits = new Map<string, number>();
    const endpoint429 = new Map<string, number>();
    const endpointLatency = new Map<string, { total: number; count: number }>();
    const failureCategories = new Map<string, number>();
    const batchStats = { processed: 0, succeeded: 0, cached: 0, rateLimited: 0 };
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
        .map(([url, count]) => {
          const latency = endpointLatency.get(url);
          return `${shortEndpoint(url)}:${count}${latency ? `/${Math.round(latency.total / latency.count)}ms` : ''}/${providerRate(url).toFixed(2)}txps`;
        })
        .join(', ') || '-';
      const rateLimitSummary = Array.from(endpoint429.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([url, count]) => `${shortEndpoint(url)}:${count}`)
        .join(', ');
      const failuresSummary = Array.from(failureCategories.entries()).map(([category, count]) => `${category}:${count}`).join(', ');
      console.log(
        `[fetchWalletTransactions] rpc-batch wallet=${pubkey} progress=${batchStats.processed}/${filtered.length} ok=${batchStats.succeeded} cached=${batchStats.cached} failed=${failed.length} 429=${batchStats.rateLimited} elapsedMs=${Date.now() - batchStart} downloadTxps=${((batchStats.succeeded - batchStats.cached) * 1000 / Math.max(1, Date.now() - batchStart)).toFixed(2)} endpoints=[${endpointsSummary}]${rateLimitSummary ? ` 429ByEndpoint=[${rateLimitSummary}]` : ''}${failuresSummary ? ` attemptsByError=[${failuresSummary}]` : ''}`
      );
    };

    console.log(
      `[fetchWalletTransactions] rpc-batch start wallet=${pubkey} signatures=${filtered.length} concurrency=${MAX_CONCURRENT} maxRetries=${maxRetries} poolEndpoints=${endpoints.length}`
    );

    const pending: { signature: string; blockTime?: number; attempts: number; failedEndpoints: Set<string>; lastError?: unknown }[] = [];
    await fetchWithLimit(filtered.map(sig => async () => {
      if (cacheTransactions) {
        const cached = await getCachedWalletTransaction(pubkey, sig.signature, profileId);
        if (cached) {
          txs.push(cached);
          batchStats.cached++;
          batchStats.succeeded++;
          batchStats.processed++;
          logBatchProgress(batchStats.processed === filtered.length);
          return;
        }
      }
      pending.push({ ...sig, attempts: 0, failedEndpoints: new Set<string>() });
    }), MAX_CONCURRENT);

    const groups = Array.from({ length: Math.ceil(pending.length / 5) }, (_, index) => pending.slice(index * 5, index * 5 + 5));
    const tasks = groups.map(group => async () => {
      let remaining = group;
      while (remaining.length > 0 && !poolUnavailable) {
        const excluded = new Set(remaining[0].failedEndpoints);
        for (const url of excluded) {
          if (remaining.some(item => !item.failedEndpoints.has(url))) excluded.delete(url);
        }
        let pick: any = null;
        try {
          pick = await RpcPoolManager.pickRpcConnection(profileId, { waitForMs: RPC_POOL_WAIT_MS, excludeUrls: excluded });
        } catch (e: any) {
          if (e?.message === 'No available RPC endpoint') {
            if (!poolUnavailable) console.warn(`[fetchWalletTransactions] RPC pool unavailable after ${RPC_POOL_WAIT_MS}ms; stopping batch for wallet=${pubkey}`);
            poolUnavailable = true;
            break;
          }
          throw e;
        }
        const { endpoint, release } = pick;
        const untried = remaining.filter(item => !item.failedEndpoints.has(endpoint.url));
        const candidates = untried.length > 0 ? untried : remaining;
        const requested = candidates.slice(0, transactionBatchSize(endpoint.url, candidates.length));
        const start = Date.now();
        endpointHits.set(endpoint.url, (endpointHits.get(endpoint.url) || 0) + requested.length);
        let response: Awaited<ReturnType<typeof fetchTransactionBatch>> | undefined;
        try {
          response = await fetchTransactionBatch(endpoint, requested.map(item => item.signature));
        } catch (error: any) {
          if (error?.batchUnsupported) {
            release({ errorType: 'unsupported' });
            console.warn(`[fetchWalletTransactions] JSON-RPC batch unsupported by ${shortEndpoint(endpoint.url)}; using single requests`);
            continue;
          }
          const plan = classifyRpcFetchError(error, 1);
          release({ success: false, errorType: plan.errorType, retryAfterMs: error?.retryAfterMs });
          if (plan.errorType === '429') {
            recordBatchOutcome(endpoint.url, true, error?.retryAfterMs);
            batchStats.rateLimited++;
            bumpCounter(endpoint429, endpoint.url);
          }
          for (const item of requested) {
            item.attempts++;
            item.lastError = error;
            item.failedEndpoints.add(endpoint.url);
            bumpCounter(failureCategories, walletFetchFailureCategory(error));
          }
          await sleep(plan.delayMs);
        }
        if (response) {
          const latency = endpointLatency.get(endpoint.url) || { total: 0, count: 0 };
          latency.total += Date.now() - start;
          latency.count++;
          endpointLatency.set(endpoint.url, latency);
          const plans = Array.from(response.errors.values(), error => classifyRpcFetchError(error, 1));
          const plan = plans.find(item => item.errorType === '429') || plans.find(item => item.errorType === '403') || plans[0];
          const hasTransactions = response.transactions.some(tx => tx !== null);
          if (plan) {
            release({ success: false, errorType: plan.errorType });
            if (plan.errorType === '429') {
              recordBatchOutcome(endpoint.url, true);
              batchStats.rateLimited++;
              bumpCounter(endpoint429, endpoint.url);
            }
          } else if (!hasTransactions) {
            release({ success: false, errorType: 'error' });
          } else {
            release({ success: true, latencyMs: Date.now() - start });
            if (response.transactions.every(tx => tx !== null)) recordBatchOutcome(endpoint.url, false);
          }
          for (let index = 0; index < requested.length; index++) {
            const item = requested[index];
            item.attempts++;
            const tx = response.transactions[index];
            if (tx) {
              const cachedTx = { signature: item.signature, blockTime: item.blockTime, ...tx };
              if (cacheTransactions) await cacheWalletTransaction(pubkey, cachedTx, profileId);
              txs.push(cachedTx);
              batchStats.succeeded++;
              batchStats.processed++;
              remaining = remaining.filter(entry => entry !== item);
              logBatchProgress(batchStats.processed === filtered.length);
            } else {
              item.lastError = response.errors.get(index) || new Error('RPC returned null transaction for known signature');
              item.failedEndpoints.add(endpoint.url);
              bumpCounter(failureCategories, walletFetchFailureCategory(item.lastError));
            }
          }
        }
        const exhausted = remaining.filter(item => item.attempts >= maxRetries);
        for (const item of exhausted) {
          failed.push(item.signature);
          console.log(`[fetchWalletTransactions] FALLIMENTO signature=${item.signature} dopo ${item.attempts} tentativi. Ultimo errore: ${summarizeRpcFetchError(item.lastError)}`);
          batchStats.processed++;
          logBatchProgress(batchStats.processed === filtered.length);
        }
        remaining = remaining.filter(item => item.attempts < maxRetries);
      }
      for (const item of remaining) {
        failed.push(item.signature);
        batchStats.processed++;
        console.log(`[fetchWalletTransactions] FALLIMENTO signature=${item.signature}: RPC pool unavailable`);
        logBatchProgress(batchStats.processed === filtered.length);
      }
    });
    
    await fetchWithLimit(tasks, MAX_CONCURRENT);
    return { txs, total, failed };
  } catch (e: any) {
    console.log('[fetchWalletTransactions] Errore:', e?.message || e);
    throw e;
  }
}

// Endpoint che hanno dimostrato di non supportare getSignaturesForAddress (blocklist per sessione)
const sigAddrUnsupported = new Set<string>();

function supportsSignatureQueries(endpoint: any): boolean {
  return !String(endpoint?.url || '').includes('gateway.tatum.io');
}

// Cross-check delle signature ottenute da più endpoint del pool — esecuzione parallela
export async function crossCheckSignatures(profileId: string, pubkey: string, sinceMs: number, endpointsToCheck = 3, maxPages = 50): Promise<{perEndpoint: Record<string, {count: number, signatures: string[]}>, intersection: string[], union: string[], differences: Record<string,string[]>}> {
  const address = new PublicKey(pubkey);
  const pool = await RpcPoolManager.loadOrCreateRpcPool(profileId);
  // Preferisci endpoint healthy ed esclude quelli noti per non supportare getSignaturesForAddress
  const healthy = pool.filter(ep =>
    RpcPoolManager.health.isHealthy(ep.url) &&
    !RpcPoolManager.health.isInBackoff(ep.url) &&
    !sigAddrUnsupported.has(ep.url) &&
    supportsSignatureQueries(ep)
  );
  const candidates = (healthy.length > 0
    ? healthy
    : pool.filter(ep => !sigAddrUnsupported.has(ep.url) && supportsSignatureQueries(ep)));
  const chosen = candidates.slice(0, Math.max(1, Math.min(endpointsToCheck, candidates.length)));

  const EP_MAX_MS = 1500; // budget per endpoint

  const fetchOneEndpoint = async (ep: any): Promise<[string, {count: number, signatures: string[]}]> => {
    const { connection: conn } = await getRpcConnectionWithUrl({
      rpcUrl: ep.url,
      commitment: 'confirmed',
      headers: ep.headers,
      disableRetryOnRateLimit: true,
    });
    const sigs: string[] = [];
    let before: string | undefined = undefined;
    const seenCursors = new Set<string>();
    const epStart = Date.now();
    for (let page = 0; page < maxPages; page++) {
      if (Date.now() - epStart > EP_MAX_MS) {
        console.warn('[crossCheckSignatures] endpoint time budget exceeded for', ep.url);
        break;
      }
      try {
        const pageSigs = await withRpcTimeout(
          conn.getSignaturesForAddress(address, { before }),
          10000,
          'cross-check getSignaturesForAddress',
        );
        if (!pageSigs || pageSigs.length === 0) break;
        for (const s of pageSigs) {
          if (s.blockTime && s.blockTime * 1000 >= sinceMs) sigs.push(s.signature);
        }
        const last = pageSigs[pageSigs.length - 1];
        if (last && last.blockTime && (last.blockTime * 1000) < sinceMs) break;
        const nextCursor = last?.signature;
        if (!nextCursor || seenCursors.has(nextCursor)) {
          console.warn('[crossCheckSignatures] endpoint returned a repeated or missing pagination cursor:', ep.url);
          break;
        }
        seenCursors.add(nextCursor);
        before = nextCursor;
      } catch (e: any) {
        const msg = String(e?.message || '');
        const is429 = e?.status === 429 || msg.includes('429');
        if (is429) {
          await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 800)));
          continue;
        }
        // Errore non-429: potrebbe essere che l'endpoint non supporti il metodo
        const isMethodUnsupported =
          msg.includes('not available for anonymous') ||
          msg.includes('Method') ||
          msg.includes('not available') ||
          e?.status === 403;
        if (isMethodUnsupported) {
          sigAddrUnsupported.add(ep.url);
          console.warn('[crossCheckSignatures] endpoint rimosso dalla blocklist (metodo non supportato):', ep.url);
        } else {
          console.warn('[crossCheckSignatures] errore su endpoint', ep.url, msg);
        }
        break;
      }
    }
    return [ep.url, { count: sigs.length, signatures: Array.from(new Set(sigs)) }];
  };

  // Tutti gli endpoint in parallelo
  const results = await Promise.all(chosen.map(fetchOneEndpoint));
  const perEndpoint: Record<string, {count: number, signatures: string[]}> = Object.fromEntries(results);

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
