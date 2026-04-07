export type DialogTxResult =
  | { state: 'success'; txSignature: string }
  | { state: 'error'; detail: string };

export function isLikelyTransactionSignature(value: unknown): value is string {
  return typeof value === 'string' && /^(0x[a-fA-F0-9]{32,}|[1-9A-HJ-NP-Za-km-z]{32,88})$/.test(value.trim());
}

export function normalizeDialogTxResult(result: unknown): DialogTxResult {
  const text = typeof result === 'string' ? result.trim() : '';

  if (isLikelyTransactionSignature(text)) {
    return {
      state: 'success',
      txSignature: text,
    };
  }

  return {
    state: 'error',
    detail: text || 'Unknown error',
  };
}
