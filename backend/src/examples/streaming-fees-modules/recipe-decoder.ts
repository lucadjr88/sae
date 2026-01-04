// Modulo per decoding account recipe con multi-decoder approach
// Estrae la logica complessa di fetch e decoding recipe/process/item accounts

import { PublicKey } from '@solana/web3.js';
import { decodeRecipe, decodeCraftingProcess, decodeCraftableItem } from '../../decoders/crafting-decoder.js';
import { decodeAccountWithRust } from '../../decoders/rust-wrapper.js';
import { resolveMints } from '../../utils/metaplex-metadata.js';
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import {
  RecipeDecoderInput,
  RecipeDecoderOutput
} from './interfaces.js';

/**
 * Decoding account recipe con approccio multi-decoder
 * Estrae la logica complessa di riconoscimento recipe/process/item dalla funzione monolitica
 */
export async function decodeRecipeAccounts(input: RecipeDecoderInput): Promise<RecipeDecoderOutput> {
  const { transaction: tx, sharedPoolConnection, craftProgramId, excludeAccounts } = input;

  let decodedRecipe: RecipeDecoderOutput['decodedRecipe'];
  let craftingMaterial: string | undefined;
  let craftingType: string | undefined;

  // === CANDIDATE SELECTION ===
  // Filtra accountKeys escludendo excludeAccounts e prendendo primi 6 validi
  const candidates = tx.accountKeys && Array.isArray(tx.accountKeys)
    ? tx.accountKeys.filter(k => k && !excludeAccounts.includes(k) && k.length > 40).slice(0, 6)
    : [];

  if (candidates.length > 0) {
    // === ACCOUNT FETCHING CON POOL CONNECTION ===
    for (let ci = 0; ci < candidates.length && !decodedRecipe; ci++) {
      try {
        const accInfo = await sharedPoolConnection.getAccountInfo(new PublicKey(candidates[ci]), {
          timeoutMs: 5000,
          maxRetries: 0,
          logErrors: false,
        });

        if (!accInfo || !accInfo.data) continue;

        // === OWNER VALIDATION ===
        if (accInfo.owner && accInfo.owner.toBase58() !== craftProgramId) continue;

        // === RUST DECODER FIRST ===
        try {
          const rr = decodeAccountWithRust(accInfo.data);
          if (rr) {
            // Direct properties
            if (rr.recipe || rr.Recipe) {
              decodedRecipe = { kind: 'recipe', data: rr.recipe || rr.Recipe };
              break;
            }
            if (rr.process || rr.Process) {
              decodedRecipe = { kind: 'process', data: rr.process || rr.Process };
              break;
            }
            if (rr.item || rr.Item) {
              decodedRecipe = { kind: 'item', data: rr.item || rr.Item };
              break;
            }

            // Nested in rr.data
            if (rr.data && (rr.data.Recipe || rr.data.Process || rr.data.Item)) {
              const inner = rr.data;
              if (inner.Recipe) {
                decodedRecipe = { kind: 'recipe', data: inner.Recipe };
                break;
              }
              if (inner.Process) {
                decodedRecipe = { kind: 'process', data: inner.Process };
                break;
              }
              if (inner.Item) {
                decodedRecipe = { kind: 'item', data: inner.Item };
                break;
              }
            }
          }
        } catch (e) {
          // Ignora errori Rust decoder, continua con JS decoders
        }

        // === JS DECODERS FALLBACK ===
        if (!decodedRecipe) {
          const dr = decodeRecipe(accInfo.data);
          if (dr) {
            decodedRecipe = { kind: 'recipe', data: dr };
            break;
          }
        }

        if (!decodedRecipe) {
          const dp = decodeCraftingProcess(accInfo.data);
          if (dp) {
            decodedRecipe = { kind: 'process', data: dp };
            break;
          }
        }

        if (!decodedRecipe) {
          const di = decodeCraftableItem(accInfo.data);
          if (di) {
            decodedRecipe = { kind: 'item', data: di };
            break;
          }
        }

      } catch (err) {
        // Tolera errori individuali di fetch, continua con prossimi candidate
      }
    }
  }

  // === METADATA RESOLUTION E MATERIAL EXTRACTION ===
  if (decodedRecipe) {
    if (decodedRecipe.kind === 'recipe') {
      // Estrai mints da recipe_items e risolvi metadata
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
      craftingType = `Recipe:${decodedRecipe.data.category?.slice(0,8) || decodedRecipe.data.version}`;

    } else if (decodedRecipe.kind === 'process') {
      craftingType = `Process:${decodedRecipe.data.crafting_id}`;
      // recipe pubkey può essere hint per il materiale
      craftingMaterial = decodedRecipe.data.recipe;

    } else if (decodedRecipe.kind === 'item') {
      craftingType = `OutputItem`;
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

  return {
    decodedRecipe,
    craftingMaterial,
    craftingType
  };
}