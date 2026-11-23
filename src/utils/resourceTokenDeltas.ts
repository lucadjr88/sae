import { normalizeMaterialMint } from './resourceMaterials.js';

export type TokenDelta = {
  accountIndex: number;
  mint: string;
  owner: string;
  preAmount: number;
  postAmount: number;
  delta: number;
  decimals: number;
};

export type TokenDeltaResult = {
  deltas: TokenDelta[];
  burned: Array<{ mint: string; amount: number; owner: string; decimals: number }>;
  minted: Array<{ mint: string; amount: number; owner: string; decimals: number }>;
};

function toUiAmount(amountRaw: unknown, decimalsRaw: unknown): number {
  const amount = Number(amountRaw);
  const decimals = Number(decimalsRaw);

  if (!Number.isFinite(amount)) return 0;
  if (!Number.isFinite(decimals) || decimals <= 0) return amount;
  return amount / Math.pow(10, decimals);
}

export function extractTokenDeltas(op: any): TokenDeltaResult {
  const pre = (op.txInfo?.preTokenBalances as any[]) || [];
  const post = (op.txInfo?.postTokenBalances as any[]) || [];
  const preMap = new Map(pre.map((p: any) => [p.accountIndex, p]));
  const postMap = new Map(post.map((p: any) => [p.accountIndex, p]));
  const allIndexes = new Set([...preMap.keys(), ...postMap.keys()]);
  const deltas: TokenDelta[] = [];
  const burned: TokenDeltaResult['burned'] = [];
  const minted: TokenDeltaResult['minted'] = [];

  for (const idx of allIndexes) {
    const preBalance = preMap.get(idx);
    const postBalance = postMap.get(idx);

    if (preBalance && !postBalance) {
      burned.push({
        mint: normalizeMaterialMint(preBalance.mint),
        amount: toUiAmount(preBalance.uiTokenAmount?.amount, preBalance.uiTokenAmount?.decimals),
        owner: preBalance.owner || '',
        decimals: preBalance.uiTokenAmount.decimals
      });
    } else if (!preBalance && postBalance) {
      minted.push({
        mint: normalizeMaterialMint(postBalance.mint),
        amount: toUiAmount(postBalance.uiTokenAmount?.amount, postBalance.uiTokenAmount?.decimals),
        owner: postBalance.owner || '',
        decimals: postBalance.uiTokenAmount.decimals
      });
    } else if (preBalance && postBalance) {
      const preAmount = parseFloat(preBalance.uiTokenAmount.amount);
      const postAmount = parseFloat(postBalance.uiTokenAmount.amount);
      const delta = postAmount - preAmount;

      if (delta !== 0) {
        deltas.push({
          accountIndex: idx,
          mint: normalizeMaterialMint(preBalance.mint),
          owner: preBalance.owner,
          preAmount,
          postAmount,
          delta: delta / Math.pow(10, preBalance.uiTokenAmount.decimals),
          decimals: preBalance.uiTokenAmount.decimals
        });
      }
    }
  }

  return { deltas, burned, minted };
}
