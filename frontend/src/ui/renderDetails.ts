// Render crafting details rows
import { inferRecipeName, inferMaterialLabel, normalizeOpName } from '@utils/utils';
export function renderCraftingDetailsRows(details: any[], maxDetails: number = 50): string {
  let html: string = '';
  details.slice(0, maxDetails).forEach(d => {
    const txid: string = d.txid || d.signature || '';
    let material: string = d.material || '';
    const feeSol: string = (Number(d.fee) / 1e9).toFixed(6);
    const feeUsd: string = (window as any).prices && (window as any).prices.solana ? ((Number(d.fee) / 1e9) * (window as any).prices.solana.usd).toFixed(2) : '--';

    let txLink: string = '';
    if (txid && txid.includes('+')) {
      const [tx1, tx2] = txid.split('+');
      txLink = `<span data-copy style="cursor:pointer;color:#60a5fa;text-decoration:underline;" onclick="copyToClipboard('${tx1}', event)" title="Click to copy Start tx">${tx1}...</span> + <span data-copy style="cursor:pointer;color:#60a5fa;text-decoration:underline;" onclick="copyToClipboard('${tx2}', event)" title="Click to copy Complete tx">${tx2.substring(0, 8)}...</span>`;
    } else if (txid) {
      txLink = `<span data-copy style="cursor:pointer;color:#60a5fa;text-decoration:underline;" onclick="copyToClipboard('${txid}', event)" title="Click to copy tx">${txid}...</span>`;
    }
    const detailsCellId: string = `details-cell-${txid}`;
    let detailsText: string = '';
    let decodedCached: any = null;
    // Normalize any operation name present in the detail (support different fields)
    const rawOp = d.operationName || d.operation || d.op || '';
    const opLabel = rawOp ? normalizeOpName(String(rawOp)) : '';
    try {
      const dd: any = d.decodedData || d.decodedRecipe || null;
      if (d.decodedKind && dd) {
        if (d.decodedKind === 'process') {
          const recipe = dd.recipe || dd.recipe_pubkey || dd.recipeId || '';
          const craftFac = dd.crafting_facility || dd.craftingFacility || '';
          const qty = dd.quantity != null ? `qty:${dd.quantity}` : '';
          detailsText = `process ${recipe ? '(' + (recipe.toString().substring ? recipe.toString().substring(0,8) + '...' : recipe) + ')' : ''} ${craftFac ? '@' + craftFac.toString().substring(0,8) + '...' : ''} ${qty}`.trim();
          decodedCached = { recipeName: recipe, craftingFacility: craftFac };
        } else if (d.decodedKind === 'recipe') {
          const cat = dd.category || dd.version || '';
          const items = dd.recipe_items ? (Array.isArray(dd.recipe_items) ? dd.recipe_items.map(i => i.mint ? (i.mint.substring ? i.mint.substring(0,8)+'...' : i.mint) : '').join(',') : '') : '';
          detailsText = `recipe ${cat ? '('+cat+')' : ''} ${items ? ':'+items : ''}`.trim();
          decodedCached = { recipeName: dd.recipeName || cat };
        } else if (d.decodedKind === 'item') {
          const mint = dd.mint || dd.item_mint || '';
          detailsText = `item ${mint ? '(' + (mint.toString().substring ? mint.toString().substring(0,8) + '...' : mint) + ')' : ''}`;
          decodedCached = { itemMint: mint };
        } else {
          const burns = (dd && (dd.burnedMaterials || (dd.actions && dd.actions[0] && dd.actions[0].burnedMaterials))) || [];
          const claims = (dd && (dd.claimedItems || (dd.actions && dd.actions[0] && dd.actions[0].claimedItems))) || [];
          const prod = inferRecipeName(dd, burns, claims);
          const prodLabel = prod || inferMaterialLabel({ material: '' }, dd) || '';
          detailsText = prodLabel ? prodLabel : '';
          if (!detailsText) {
            try { detailsText = JSON.stringify(dd).slice(0, 160); } catch (e) { detailsText = String(dd).substring(0,160); }
          }
          decodedCached = dd;
        }
      } else if (dd) {
        const burns = (dd && (dd.burnedMaterials || (dd.actions && dd.actions[0] && dd.actions[0].burnedMaterials))) || [];
        const claims = (dd && (dd.claimedItems || (dd.actions && dd.actions[0] && dd.actions[0].claimedItems))) || [];
        const prod = inferRecipeName(dd, burns, claims);
        const prodLabel = prod || inferMaterialLabel({ material: '' }, dd) || '';
        detailsText = prodLabel ? prodLabel : '';
        if (!detailsText) {
          try { detailsText = JSON.stringify(dd).slice(0, 160); } catch (e) { detailsText = String(dd).substring(0,160); }
        }
        decodedCached = dd;
      }
    } catch (err) {
      // ...
    }
    // Include operation label as first column (if present)
    if (opLabel) {
      html += `<tr><td style="font-weight:600">${opLabel}</td><td>${material}</td><td>${txLink}</td><td id="${detailsCellId}">${detailsText}</td><td>${feeSol}</td><td>${feeUsd}</td></tr>`;
    } else {
      //html += `<tr><td></td><td>${material}</td><td>${txLink}</td><td id="${detailsCellId}">${detailsText}</td><td>${feeSol}</td><td>${feeUsd}</td></tr>`;
      html += `<tr><<td>${txLink}</td><td id="${detailsCellId}">${detailsText}</td><td>${feeSol}</td><td>${feeUsd}</td></tr>`;
    }
  });
  return html;
}

