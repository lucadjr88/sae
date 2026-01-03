import { CraftingExtra } from '../types/wallet-fees-streaming-types.js';
import { decodeRecipe, isRecipeAccount, decodeCraftingProcess, decodeCraftableItem } from '../decoders/crafting-decoder.js';
import { decodeAccountWithRust } from '../decoders/rust-wrapper.js';
import { resolveMints } from '../utils/metaplex-metadata.js';
import { RpcPoolConnection } from '../utils/rpc/pool-connection.js';
import { PublicKey } from '@solana/web3.js';

export interface EnrichCraftingContext {
  sharedPoolConnection: RpcPoolConnection;
  resolveMints: (mints: string[]) => Promise<any>;
  CRAFT_PROGRAM_ID: string;
}

export async function enrichCrafting(tx: any, ctx: EnrichCraftingContext): Promise<CraftingExtra> {
  const { sharedPoolConnection, resolveMints, CRAFT_PROGRAM_ID } = ctx;

  let decodedRecipe: { kind: string; data: any } | undefined = undefined;
  let craftingMaterial: string | undefined = undefined;
  let craftingType: string | undefined = undefined;
  let craftingAction: string = 'crafting_start'; // default

  if (!tx.accountKeys || !Array.isArray(tx.accountKeys)) return {};

  // Determine start/claim using token balance deltas first
  try {
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];
    const preMap: Record<string, any> = {};
    for (const p of preBalances) {
      if (!p) continue;
      const key = `${p.owner || ''}:${p.mint || ''}`;
      preMap[key] = p;
    }
    let foundPos = false;
    let foundNeg = false;
    for (const p of postBalances) {
      if (!p || !p.mint) continue;
      const key = `${p.owner || ''}:${p.mint}`;
      const pre = preMap[key];
      const preAmt = pre?.uiTokenAmount?.amount ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmt = p.uiTokenAmount?.amount ? BigInt(p.uiTokenAmount.amount) : 0n;
      const delta = postAmt - preAmt;
      if (delta > 0n) foundPos = true;
      if (delta < 0n) foundNeg = true;
    }
    if (foundPos && !foundNeg) craftingAction = 'crafting_claim';
    else if (foundNeg && !foundPos) craftingAction = 'crafting_start';
    else if (foundPos) craftingAction = 'crafting_claim';
  } catch (e) {
    // fallback to logs
  }

  // Fallback to logs if deltas inconclusive
  if (craftingAction === 'crafting_start') {
    const logsStr = (tx.meta?.logMessages || []).join(' ').toLowerCase();
    if (logsStr.includes('claim') || logsStr.includes('complete') || logsStr.includes('withdraw')) {
      craftingAction = 'crafting_claim';
    }
  }

  // Fallback to inner instructions token transfers: any positive MATERIAL transfer implies claim
  if (craftingAction === 'crafting_start') {
    try {
      const inners = tx.meta?.innerInstructions || [];
      let posFound = false;
      for (const inner of inners || []) {
        for (const inst of inner.instructions || []) {
          const parsed = (inst as any).parsed?.info || (inst as any).info || (inst as any).parsed;
          if (!parsed) continue;
          const amount = parsed.amount || parsed.tokenAmount?.amount || parsed.uiTokenAmount?.amount;
          const mint = parsed.mint || parsed.mintAddress || parsed.tokenMint;
          if (!amount || !mint) continue;
          const a = BigInt(String(amount));
          if (a > 0n) { posFound = true; break; } // TODO: check MATERIALS[mint]
        }
        if (posFound) break;
      }
      if (posFound) craftingAction = 'crafting_claim';
    } catch (e) { }
  }

  try {
    const candidates = tx.accountKeys.filter((k: string) => k && k.length > 40).slice(0, 6);
    if (candidates.length > 0) {
      for (let ci = 0; ci < candidates.length && !decodedRecipe; ci++) {
        try {
          const accInfo = await sharedPoolConnection.getAccountInfo(new PublicKey(candidates[ci]), {
            timeoutMs: 5000,
            maxRetries: 0,
            logErrors: false,
          });
          if (!accInfo || !accInfo.data) continue;
          if (accInfo.owner && accInfo.owner.toBase58() !== CRAFT_PROGRAM_ID) continue;

          // Try Rust decoder
          try {
            const rr = decodeAccountWithRust(accInfo.data);
            if (rr) {
              if (rr.recipe || rr.Recipe) { decodedRecipe = { kind: 'recipe', data: rr.recipe || rr.Recipe }; break; }
              if (rr.process || rr.Process) { decodedRecipe = { kind: 'process', data: rr.process || rr.Process }; break; }
              if (rr.item || rr.Item) { decodedRecipe = { kind: 'item', data: rr.item || rr.Item }; break; }
              if (rr.data && (rr.data.Recipe || rr.data.Process || rr.data.Item)) {
                const inner = rr.data;
                if (inner.Recipe) { decodedRecipe = { kind: 'recipe', data: inner.Recipe }; break; }
                if (inner.Process) { decodedRecipe = { kind: 'process', data: inner.Process }; break; }
                if (inner.Item) { decodedRecipe = { kind: 'item', data: inner.Item }; break; }
              }
            }
          } catch (e) {
            // ignore rust wrapper failures
          }

          // Try JS decoders
          if (!decodedRecipe) {
            const dr = decodeRecipe(accInfo.data);
            if (dr) { decodedRecipe = { kind: 'recipe', data: dr }; break; }
          }
          if (!decodedRecipe) {
            const dp = decodeCraftingProcess(accInfo.data);
            if (dp) { decodedRecipe = { kind: 'process', data: dp }; break; }
          }
          if (!decodedRecipe) {
            const di = decodeCraftableItem(accInfo.data);
            if (di) { decodedRecipe = { kind: 'item', data: di }; break; }
          }
        } catch (err) {
          // tolerate individual fetch errors
        }
      }
    }

    if (decodedRecipe) {
      if (decodedRecipe.kind === 'recipe') {
        const mints = (decodedRecipe.data.recipe_items || []).map((ri: any) => ri.mint).filter(Boolean);
        if (mints && mints.length > 0) {
          try {
            const md = await resolveMints(mints);
            const display = mints.map((mm: string) => {
              const info = md[mm];
              if (info && info.name) return info.name + (info.symbol ? ` (${info.symbol})` : '');
              return mm;
            }).join(', ');
            craftingMaterial = display;
          } catch (e) {
            craftingMaterial = mints.join(', ');
          }
        }
        craftingType = craftingType || `Recipe:${decodedRecipe.data.category?.slice(0, 8) || decodedRecipe.data.version}`;
      } else if (decodedRecipe.kind === 'process') {
        craftingType = craftingType || `Process:${decodedRecipe.data.crafting_id}`;
        // recipe pubkey may hint the recipe
        craftingMaterial = craftingMaterial || decodedRecipe.data.recipe;
      } else if (decodedRecipe.kind === 'item') {
        craftingType = craftingType || `OutputItem`;
        if (decodedRecipe.data.mint) {
          try {
            const md = await resolveMints([decodedRecipe.data.mint]);
            const info = md[decodedRecipe.data.mint];
            craftingMaterial = info && info.name ? (info.name + (info.symbol ? ` (${info.symbol})` : '')) : decodedRecipe.data.mint;
          } catch (e) {
            craftingMaterial = decodedRecipe.data.mint;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return {
    decodedRecipe,
    craftingMaterial,
    craftingType,
    craftingAction,
  };
}