import { Connection, type VersionedTransactionResponse } from '@solana/web3.js';
import nodeFetch, { Headers, Response } from 'node-fetch';

type Endpoint = { url: string; headers?: Record<string, string> };
type RpcError = Error & { status?: number; retryAfterMs?: number; code?: number; batchUnsupported?: boolean };
type RpcResponse = { jsonrpc?: string; id?: string | number | null; result?: unknown; error?: { code?: number; message?: string } };

const noBatch = new Set<string>();
const providers = new Map<string, { next: number; rate: number; successes: number; active: number }>();

export function transactionBatchSize(url: string, remaining: number): number {
  return noBatch.has(url) ? 1 : Math.min(5, remaining);
}

export function providerRate(url: string): number {
  return provider(url).rate;
}

function provider(url: string) {
  const host = new URL(url).host;
  let state = providers.get(host);
  if (!state) {
    state = { next: 0, rate: 2, successes: 0, active: 0 };
    providers.set(host, state);
  }
  return state;
}

async function waitForBudget(url: string, count: number) {
  const state = provider(url);
  while (Date.now() < state.next) {
    await new Promise(resolve => setTimeout(resolve, Math.min(30_000, state.next - Date.now())));
  }
  state.next = Date.now() + Math.ceil(count * 1000 / state.rate);
}

export function recordBatchOutcome(url: string, rateLimited: boolean, retryAfterMs = 0) {
  const state = provider(url);
  if (rateLimited) {
    state.rate = Math.max(0.25, state.rate / 2);
    state.successes = 0;
    state.next = Math.max(state.next, Date.now() + retryAfterMs);
  } else if (++state.successes >= 20) {
    state.rate = Math.min(5, state.rate + 0.25);
    state.successes = 0;
  }
}

function retryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function rpcError(message: string, status?: number, retryAfterMs?: number, code?: number): RpcError {
  return Object.assign(new Error(message), { status, retryAfterMs, code });
}

export async function fetchTransactionBatch(
  endpoint: Endpoint,
  signatures: string[],
): Promise<{ transactions: (VersionedTransactionResponse | null)[]; errors: Map<number, RpcError> }> {
  const batch = signatures.length > 1;
  const requested = signatures;
  const errors = new Map<number, RpcError>();
  const customFetch: typeof nodeFetch = async (resource, init) => {
    const state = provider(endpoint.url);
    while (state.active >= 2) await new Promise(resolve => setTimeout(resolve, 50));
    state.active++;
    try {
      await waitForBudget(endpoint.url, requested.length);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const headers = new Headers(init?.headers);
        for (const [name, value] of Object.entries(endpoint.headers || {})) headers.set(name, value);
        if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'identity');
        const response = await nodeFetch(resource, {
          ...init,
          headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          if (batch && (response.status === 400 || response.status === 405 || response.status === 415)) {
            noBatch.add(endpoint.url);
            throw Object.assign(rpcError('RPC endpoint rejected JSON-RPC batch', response.status), { batchUnsupported: true });
          }
          throw rpcError(`RPC HTTP ${response.status} ${response.statusText}`, response.status, retryAfter(response.headers.get('retry-after')));
        }
        if (!batch) {
          return new Response(await response.text(), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const sent: unknown = JSON.parse(String(init?.body));
        const received: unknown = await response.json();
        if (!Array.isArray(sent)) throw new Error('Invalid JSON-RPC batch request');
        if (!Array.isArray(received)) {
          const error = received as RpcResponse;
          if (error?.error?.code === -32600) {
            noBatch.add(endpoint.url);
            throw Object.assign(rpcError('RPC endpoint does not support JSON-RPC batch', undefined, undefined, -32600), { batchUnsupported: true });
          }
          if (error?.error) throw rpcError(error.error.message || 'JSON-RPC batch error', undefined, undefined, error.error.code);
          throw new Error('Invalid JSON-RPC batch response');
        }
        const replies = new Map<string | number, RpcResponse>();
        const duplicates = new Set<string | number>();
        for (const item of received as RpcResponse[]) {
          if (!item || (typeof item.id !== 'string' && typeof item.id !== 'number')) throw new Error('Invalid JSON-RPC batch response ID');
          if (replies.has(item.id)) duplicates.add(item.id);
          replies.set(item.id, item);
        }
        const ordered = sent.map((request: { id: string | number }, index: number) => {
          const reply = replies.get(request.id);
          if (!reply || duplicates.has(request.id)) {
            errors.set(index, new Error('Missing or duplicate JSON-RPC batch response ID'));
            return { jsonrpc: '2.0', id: request.id, result: null };
          }
          if (reply.error) {
            errors.set(index, rpcError(reply.error.message || 'JSON-RPC error', undefined, undefined, reply.error.code));
            return { jsonrpc: '2.0', id: request.id, result: null };
          }
          return reply;
        });
        return new Response(JSON.stringify(ordered), { status: 200, headers: { 'content-type': 'application/json' } });
      } finally {
        clearTimeout(timer);
      }
    } finally {
      state.active--;
    }
  };
  const connection = new Connection(endpoint.url, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    fetch: customFetch,
  });
  if (batch) {
    const transactions = await connection.getTransactions(requested, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    return { transactions, errors };
  }
  const transaction = await connection.getTransaction(requested[0], { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  return { transactions: [transaction], errors };
}
