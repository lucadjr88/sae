
// Helper functions extracted from app.js
// Helper functions extracted from app.js

export function updateDetailCell(cellId, decoded) {
  const cell = document.getElementById(cellId);
  if (!cell) {return;}

  let detailsHtml = '';
  try {
    const action = (decoded.actions && decoded.actions[0]) || {};
    const burns = decoded.burnedMaterials || action.burnedMaterials || [];
    const claims = decoded.claimedItems || action.claimedItems || [];
    const actionStr = (action && action.action) ? action.action.toString().toLowerCase() : '';
    let craftingStage = 'Crafting';
    if (actionStr.includes('claim')) {craftingStage = 'Claim Crafting';}
    else if (actionStr.includes('start')) {craftingStage = 'Start Crafting';}
    else if (claims && claims.length > 0) {craftingStage = 'Claim Crafting';}
    else if (burns && burns.length > 0) {craftingStage = 'Start Crafting';}
    const parts = [];
    parts.push(craftingStage);
    if (Array.isArray(burns) && burns.length > 0) {
      const burnList = burns.map(b => {
        const mat = b.material || '';
        const amt = b.amount !== null ? b.amount : '';
        const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
        return `${matLabel} ${amt}`;
      }).join(', ');
      parts.push(`Burn: ${burnList}`);
    }
    if (Array.isArray(claims) && claims.length > 0) {
      const claimList = claims.map(c => {
        const mat = c.material || c.item || '';
        const amt = c.amount !== null ? c.amount : '';
        const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
        return `${matLabel} ${amt}`;
      }).join(', ');
      parts.push(`Claim: ${claimList}`);
    }
    detailsHtml = parts.join(' • ');
  } catch (e) {
    console.error('Error formatting crafting details:', e);
    detailsHtml = '<span style="color:#ef4444">Failed to format decoded data</span>';
  }
  cell.innerHTML = detailsHtml;
}

export function updateAllDetailCells(cells, values) {
  cells.forEach((cell, i) => {
    let detailsHtml = '';
    try {
      // Supponiamo che values[i] sia il decoded corrispondente
      const decoded = values[i];
      const action = (decoded.actions && decoded.actions[0]) || {};
      const burns = decoded.burnedMaterials || action.burnedMaterials || [];
      const claims = decoded.claimedItems || action.claimedItems || [];
      const actionStr = (action && action.action) ? action.action.toString().toLowerCase() : '';
      let craftingStage = 'Crafting';
      if (actionStr.includes('claim')) {craftingStage = 'Claim Crafting';}
      else if (actionStr.includes('start')) {craftingStage = 'Start Crafting';}
      else if (claims && claims.length > 0) {craftingStage = 'Claim Crafting';}
      else if (burns && burns.length > 0) {craftingStage = 'Start Crafting';}
      const parts = [];
      parts.push(craftingStage);
      if (Array.isArray(burns) && burns.length > 0) {
        const burnList = burns.map(b => {
          const mat = b.material || '';
          const amt = b.amount !== null ? b.amount : '';
          const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
          return `${matLabel} ${amt}`;
        }).join(', ');
        parts.push(`Burn: ${burnList}`);
      }
      if (Array.isArray(claims) && claims.length > 0) {
        const claimList = claims.map(c => {
          const mat = c.material || c.item || '';
          const amt = c.amount !== null ? c.amount : '';
          const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
          return `${matLabel} ${amt}`;
        }).join(', ');
        parts.push(`Claim: ${claimList}`);
      }
      detailsHtml = parts.join(' • ');
    } catch (e) {
      console.error('Error formatting crafting details:', e);
      detailsHtml = '<span style="color:#ef4444">Failed to format decoded data</span>';
    }
    cell.innerHTML = detailsHtml;
  });
}

export function formatTimestamp(ts) {
  if (!ts) {return '';}
  if (typeof ts === 'number') {
    try { return new Date(ts * 1000).toLocaleString(); } catch { return String(ts); }
  }
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      try { return new Date(Number(ts) * 1000).toLocaleString(); } catch { return ts; }
    }
    try { const d = new Date(ts); return isNaN(d.getTime()) ? ts : d.toLocaleString(); } catch { return ts; }
  }
  return '';
}
