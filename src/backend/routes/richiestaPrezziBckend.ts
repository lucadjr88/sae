import express, { Request, Response, Router } from 'express';
import { PublicKey } from '@solana/web3.js';

const router: Router = express.Router();
const PREZZI_BATCH_URL = process.env.FLARES_PREZZI_BATCH_URL || 'https://flaresplay.xyz/api/prezzi-batch';
const MAX_MINTS = 50;
const REQUEST_TIMEOUT_MS = 10_000;
const PREZZI_BATCH_RETRY_ATTEMPTS = 5;
const PREZZI_BATCH_TOTAL_TIMEOUT_MS = 50_000;
const MINT_FORMAT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const KNOWN_MINT_ALIASES: Record<string, string> = {
  foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG9: 'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG',
  ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGETnUMvfaS: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK',
  EqXFCQHVoo89UjSUqPbLLt1T6zRKhT3E13AzF3unUs9G: 'ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK',
  '8pbBwqniQv23ZC6UngxeZMiaAWiv9G2N8ydKJquNRZ8E': 'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim'
};

type PriceSide = {
  prezzo_buy: number | null;
  prezzo_sell: number | null;
};

type MintPrices = {
  atlas: PriceSide | null;
  usdc: PriceSide | null;
};

type PrezziPayload = {
  prezzi: Record<string, MintPrices>;
  [key: string]: unknown;
};

type PrezziBatchBody = {
  richiesta_prezzi?: unknown;
  ricchiesta_prezzi?: unknown;
  mints?: unknown;
  mintList?: unknown;
};

type HttpError = Error & { status?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequestedMintList(body: PrezziBatchBody): unknown {
  return body?.richiesta_prezzi ?? body?.ricchiesta_prezzi ?? body?.mints ?? body?.mintList;
}

function buildPrezziBatchRequestBody(mints: string[]) {
  return {
    richiesta_prezzi: mints,
    ricchiesta_prezzi: mints
  };
}

function createHttpError(message: string, status: number): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}

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
  const rawList = getRequestedMintList(body);
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

function normalizePriceSide(value: unknown): PriceSide | null {
  if (!isRecord(value)) return null;

  return {
    prezzo_buy: typeof value.prezzo_buy === 'number' ? value.prezzo_buy : null,
    prezzo_sell: typeof value.prezzo_sell === 'number' ? value.prezzo_sell : null
  };
}

function normalizeMintPrices(value: unknown): MintPrices {
  if (!isRecord(value)) {
    return { atlas: null, usdc: null };
  }

  return {
    atlas: normalizePriceSide(value.atlas),
    usdc: normalizePriceSide(value.usdc)
  };
}

function normalizePrezziPayload(payload: unknown): PrezziPayload {
  if (!isRecord(payload)) {
    return { prezzi: {} };
  }

  const rawPrezzi = isRecord(payload.prezzi) ? payload.prezzi : {};
  const normalizedPrezzi = Object.fromEntries(
    Object.entries(rawPrezzi).map(([mint, value]) => {
      const normalizedMint = normalizeMintCandidate(mint) || mint;
      return [normalizedMint, normalizeMintPrices(value)];
    })
  ) as Record<string, MintPrices>;

  return { ...payload, prezzi: normalizedPrezzi };
}

function buildNullPricesPayload(mints: string[]): PrezziPayload {
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
  const status = getErrorStatus(error);
  const message = getErrorMessage(error);

  return status === 429 || (status !== null && status >= 500) || /timeout|aborted|fetch failed|network/i.test(message);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelayMs(attemptNumber: number) {
  const maxDelay = 400 * Math.pow(2, Math.max(0, attemptNumber - 1));
  return Math.floor(Math.random() * maxDelay);
}

async function fetchPrezziBatchOnce(mints: string[], timeoutMs: number): Promise<PrezziPayload> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const upstreamCall = (async () => {
      const upstream = await fetch(PREZZI_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPrezziBatchRequestBody(mints)),
        signal: controller.signal
      });

      const text = await upstream.text();
      let payload: unknown = {};
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = { error: text };
        }
      }

      if (!upstream.ok) {
        const upstreamMessage = isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : `Upstream error ${upstream.status}`;
        throw createHttpError(upstreamMessage, upstream.status);
      }

      return normalizePrezziPayload(payload);
    })();

    const attemptTimeout = new Promise<never>((_, reject) => {
      const timeoutError = createHttpError('Prices upstream timeout', 504);
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });

    return await Promise.race([upstreamCall, attemptTimeout]);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createHttpError('Prices upstream timeout', 504);
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function fetchPrezziBatch(mints: string[]): Promise<PrezziPayload> {
  const startedAt = Date.now();
  console.info(`[prezzi-batch] Fetching prices for ${mints.length} mints with up to ${PREZZI_BATCH_RETRY_ATTEMPTS} attempts and total timeout of ${PREZZI_BATCH_TOTAL_TIMEOUT_MS}ms`);

  for (let attempt = 1; attempt <= PREZZI_BATCH_RETRY_ATTEMPTS; attempt += 1) {
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = PREZZI_BATCH_TOTAL_TIMEOUT_MS - elapsedMs;
    if (remainingBudgetMs <= 0) {
      throw createHttpError(`Prices upstream total timeout (${PREZZI_BATCH_TOTAL_TIMEOUT_MS}ms)`, 504);
    }

    const attemptTimeoutMs = Math.min(REQUEST_TIMEOUT_MS, remainingBudgetMs);
    console.info(`[prezzi-batch] Upstream attempt ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS} (timeout=${attemptTimeoutMs}ms)`);

    try {
      const payload = await fetchPrezziBatchOnce(mints, attemptTimeoutMs);
      const totalMs = Date.now() - startedAt;
      console.info(`[prezzi-batch] Success at attempt ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS} after ${totalMs}ms, payload: ${JSON.stringify(payload)}`);

      const mintWithNullAtlas = Object.entries(payload.prezzi).filter(([, value]) => value.atlas?.prezzo_buy == null);
      if (mintWithNullAtlas.length > 0) {
        console.info(`[prezzi-batch] Found ${mintWithNullAtlas.length} mints with null atlas price, retrying those mints: ${mintWithNullAtlas.map(([mint]) => mint).join(', ')}`);
        const retryMints = mintWithNullAtlas.map(([mint]) => mint);
        const retryPayload = await fetchPrezziBatchOnce(retryMints, attemptTimeoutMs);

        for (const [mint, value] of Object.entries(retryPayload.prezzi)) {
          const currentPrices = payload.prezzi[mint] ?? (payload.prezzi[mint] = { atlas: null, usdc: null });
          if (currentPrices.atlas?.prezzo_buy == null && value.atlas?.prezzo_buy != null) {
            currentPrices.atlas = value.atlas;
            console.info(`[prezzi-batch] Updated atlas price for mint ${mint} from second attempt: ${JSON.stringify(value.atlas)}`);
          }
        }
        console.info(`[prezzi-batch] Null atlas prices remaining after follow-up: ${Object.values(payload.prezzi).filter((value) => value.atlas?.prezzo_buy == null).length}`);
      }

      return payload;
    } catch (error: unknown) {
      const shouldRetry = attempt < PREZZI_BATCH_RETRY_ATTEMPTS && isRetryablePrezziError(error);
      if (!shouldRetry) {
        throw error;
      }

      const delayMs = Math.min(computeBackoffDelayMs(attempt), Math.max(0, PREZZI_BATCH_TOTAL_TIMEOUT_MS - (Date.now() - startedAt)));
      console.warn(
        `[prezzi-batch] Retry ${attempt}/${PREZZI_BATCH_RETRY_ATTEMPTS - 1} after upstream error: ${getErrorMessage(error)} (next_delay=${delayMs}ms)`
      );

      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  throw createHttpError('Prices upstream retries exhausted', 504);
}

router.post('/prezzi-batch', async (req: Request<{}, {}, PrezziBatchBody>, res: Response) => {
  const providedList = getRequestedMintList(req.body || {});
  if (!Array.isArray(providedList) || providedList.length === 0) {
    return res.status(400).json({ error: 'Serve un array "richiesta_prezzi" con almeno un mint' });
  }

  const mints = extractMintList(req.body || {});
  if (mints.length === 0) {
    return res.status(400).json({ error: 'Nessun mint valido fornito' });
  }

  try {
    const payload = await fetchPrezziBatch(mints);
    return res.json(payload);
  } catch (error: unknown) {
    console.error('[prezzi-batch] Error:', getErrorMessage(error));
    const status = getErrorStatus(error) ?? 500;
    const transientUpstreamFailure = status >= 500 || status === 429 || /timeout|aborted|fetch failed/i.test(getErrorMessage(error));

    if (transientUpstreamFailure) {
      return res.json(buildNullPricesPayload(mints));
    }

    return res.status(status).json({ error: getErrorMessage(error) || 'Errore interno' });
  }
});

export default router;
