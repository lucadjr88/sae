import express, { Request, Response, Router } from 'express';
import { PublicKey } from '@solana/web3.js';

const router: Router = express.Router();
const PREZZI_BATCH_URL = process.env.FLARES_PREZZI_BATCH_URL || 'https://flaresplay.xyz/api/prezzi-batch';
const MAX_MINTS = 50;
const REQUEST_TIMEOUT_MS = 5_000;
const PREZZI_BATCH_RETRY_ATTEMPTS = 5;
const PREZZI_BATCH_TOTAL_TIMEOUT_MS = 25_000;
const MINT_FORMAT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const KNOWN_MINT_ALIASES: Record<string, string> = {
  foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG9: 'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG',
  ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGETnUMvfaS: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK',
  EqXFCQHVoo89UjSUqPbLLt1T6zRKhT3E13AzF3unUs9G: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK',
  '8pbBwqniQv23ZC6UngxeZMiaAWiv9G2N8ydKJquNRZ8E': 'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim'
};

type PrezziBatchBody = {
  ricchiesta_prezzi?: unknown;
  richiesta_prezzi?: unknown;
  mints?: unknown;
  mintList?: unknown;
};

function normalizeMintCandidate(rawMint: string): string | null {
  const mint = rawMint.trim();
  if (!mint || !MINT_FORMAT.test(mint)) return null;

  const alias = KNOWN_MINT_ALIASES[mint] ?? mint;
  const candidates = [alias];
  if (alias.length > 32 && alias === mint) {
    candidates.push(alias.slice(0, -1));
  }

  for (const candidate of candidates) {
    try {
      return new PublicKey(candidate).toBase58();
    } catch {
      continue;
    }
  }

  return null;
}

function extractMintList(body: PrezziBatchBody): string[] {
  const rawList = body?.ricchiesta_prezzi ?? body?.richiesta_prezzi ?? body?.mints ?? body?.mintList;
  if (!Array.isArray(rawList)) return [];

  const seen = new Set<string>();
  const validMints: string[] = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const mint = normalizeMintCandidate(item);
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    validMints.push(mint);
    if (validMints.length >= MAX_MINTS) break;
  }

  return validMints;
}

function normalizePrezziPayload(payload: any) {
  if (!payload?.prezzi || typeof payload.prezzi !== 'object' || Array.isArray(payload.prezzi)) {
    return payload;
  }

  const normalizedPrezzi = Object.fromEntries(
    Object.entries(payload.prezzi).map(([mint, value]) => {
      const normalizedMint = typeof mint === 'string' ? (normalizeMintCandidate(mint) || mint) : String(mint);
      return [normalizedMint, value];
    })
  );

  return { ...payload, prezzi: normalizedPrezzi };
}

function buildNullPricesPayload(mints: string[]) {
  return {
    prezzi: Object.fromEntries(
      mints.map((mint) => [
        mint,
        {
          atlas: { prezzo_buy: null, prezzo_sell: null },
          usdc: { prezzo_buy: null, prezzo_sell: null }
        }
      ])
    )
  };
}

function isRetryablePrezziError(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status?: number }).status)
    : null;
  const message = String((error as { message?: unknown })?.message || '');

  return status === 429 || (status !== null && status >= 500) || /timeout|aborted|fetch failed|network/i.test(message);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelayMs(attemptNumber: number) {
  const maxDelay = 400 * Math.pow(2, Math.max(0, attemptNumber - 1));
  return Math.floor(Math.random() * maxDelay);
}

async function fetchPrezziBatchOnce(mints: string[], timeoutMs: number) {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const upstreamCall = (async () => {
      const upstream = await fetch(PREZZI_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ricchiesta_prezzi: mints }),
        signal: controller.signal
      });

      const text = await upstream.text();
      let payload: any = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { error: text };
        }
      }

      if (!upstream.ok) {
        const err = new Error(payload?.error || `Upstream error ${upstream.status}`) as Error & { status?: number };
        err.status = upstream.status;
        throw err;
      }

      return normalizePrezziPayload(payload);
    })();

    const attemptTimeout = new Promise<never>((_, reject) => {
      const timeoutError = new Error('Prices upstream timeout') as Error & { status?: number };
      timeoutError.status = 504;
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });

    return await Promise.race([upstreamCall, attemptTimeout]);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Prices upstream timeout') as Error & { status?: number };
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function fetchPrezziBatch(mints: string[]) {
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= PREZZI_BATCH_RETRY_ATTEMPTS; attempt += 1) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = PREZZI_BATCH_TOTAL_TIMEOUT_MS - elapsedMs;
    if (remainingBudgetMs <= 0) {
      const totalTimeoutError = new Error(`Prices upstream total timeout (${PREZZI_BATCH_TOTAL_TIMEOUT_MS}ms)`) as Error & { status?: number };
      totalTimeoutError.status = 504;
      throw totalTimeoutError;
    }

    const attemptTimeoutMs = Math.min(REQUEST_TIMEOUT_MS, remainingBudgetMs);
    console.info(`[prezzi-batch] Upstream attempt ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS} (timeout=${attemptTimeoutMs}ms)`);

    try {
      const payload = await fetchPrezziBatchOnce(mints, attemptTimeoutMs);
      const totalMs = Date.now() - startedAt;
      console.info(`[prezzi-batch] Success at attempt ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS} after ${totalMs}ms`);
      return payload;
    } catch (error: any) {
      const shouldRetry = attempt < PREZZI_BATCH_RETRY_ATTEMPTS && isRetryablePrezziError(error);
      if (!shouldRetry) {
        throw error;
      }

      const delayMs = Math.min(computeBackoffDelayMs(attempt), Math.max(0, PREZZI_BATCH_TOTAL_TIMEOUT_MS - (Date.now() - startedAt)));
      console.warn(
        `[prezzi-batch] Retry ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS - 1} after upstream error: ${String(error?.message || error)} (next_delay=${delayMs}ms)`
      );

      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  const exhaustedError = new Error('Prices upstream retries exhausted') as Error & { status?: number };
  exhaustedError.status = 504;
  throw exhaustedError;
}

router.post('/prezzi-batch', async (req: Request<{}, {}, PrezziBatchBody>, res: Response) => {
  const providedList = req.body?.ricchiesta_prezzi ?? req.body?.richiesta_prezzi ?? req.body?.mints ?? req.body?.mintList;
  if (!Array.isArray(providedList) || providedList.length === 0) {
    return res.status(400).json({ error: 'Serve un array "ricchiesta_prezzi" con almeno un mint' });
  }

  const mints = extractMintList(req.body || {});
  if (mints.length === 0) {
    return res.status(400).json({ error: 'Nessun mint valido fornito' });
  }

  try {
    const payload = await fetchPrezziBatch(mints);
    return res.json(payload);
  } catch (e: any) {
    console.error('[prezzi-batch] Error:', e?.message || e);
    const status = typeof e?.status === 'number' ? e.status : 500;
    const transientUpstreamFailure = status >= 500 || status === 429 || /timeout|aborted|fetch failed/i.test(String(e?.message || ''));

    if (transientUpstreamFailure) {
      return res.json(buildNullPricesPayload(mints));
    }

    return res.status(status).json({ error: e?.message || 'Errore interno' });
  }
});

export default router;
