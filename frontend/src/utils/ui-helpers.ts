// public/js/ui-helpers.ts
import { inferMaterialLabel } from './utils';
import { analysisStartTime } from './state';
import { DecodedInstruction, BurnedMaterial, ClaimedItem } from '../types/common';

// Helper to update a detail cell with decoded transaction data
export function updateDetailCell(cellId: string, decoded: DecodedInstruction | null): void {
  const cell = document.getElementById(cellId) as HTMLElement | null;
  if (!cell) return;

  let detailsHtml = '';

  try {
    const action = (decoded?.actions && decoded.actions[0]) || {};
    const burns = decoded?.burnedMaterials || (action as any).burnedMaterials || [];
    const claims = decoded?.claimedItems || (action as any).claimedItems || [];

    // Determine if start or claim based on action field
    const actionStr = (action && (action as any).action) ? (action as any).action.toString().toLowerCase() : '';
    let craftingStage = 'Crafting';
    if (actionStr.includes('claim')) craftingStage = 'Claim Crafting';
    else if (actionStr.includes('start')) craftingStage = 'Start Crafting';
    else if (claims && claims.length > 0) craftingStage = 'Claim Crafting';
    else if (burns && burns.length > 0) craftingStage = 'Start Crafting';

    const parts = [];
    parts.push(craftingStage);

    if (Array.isArray(burns) && burns.length > 0) {
      const burnList = burns.map(b => {
        const mat = b.material || '';
        const amt = b.amount != null ? b.amount : '';
        const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
        return `${matLabel} ${amt}`;
      }).join(', ');
      parts.push(`Burn: ${burnList}`);
    }

    if (Array.isArray(claims) && claims.length > 0) {
      const claimList = claims.map(c => {
        const mat = c.material || c.item || '';
        const amt = c.amount != null ? c.amount : '';
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

// Helper to update all cells with the same txid across both sections
export function updateAllDetailCells(txid: string, decoded: DecodedInstruction | null): void {
  // Update all cells with this txid (both in fleet breakdown and operation summary)
  const cells = document.querySelectorAll<HTMLElement>(`[id^="details-cell-${txid}"]`);
  cells.forEach(cell => {
    let detailsHtml = '';

    try {
      const action = (decoded?.actions && decoded.actions[0]) || {};
      const burns = decoded?.burnedMaterials || (action as any).burnedMaterials || [];
      const claims = decoded?.claimedItems || (action as any).claimedItems || [];

      // Determine if start or claim based on action field
      const actionStr = (action && (action as any).action) ? (action as any).action.toString().toLowerCase() : '';
      let craftingStage = 'Crafting';
      if (actionStr.includes('claim')) craftingStage = 'Claim Crafting';
      else if (actionStr.includes('start')) craftingStage = 'Start Crafting';
      else if (claims && claims.length > 0) craftingStage = 'Claim Crafting';
      else if (burns && burns.length > 0) craftingStage = 'Start Crafting';

      const parts = [];
      parts.push(craftingStage);

      if (Array.isArray(burns) && burns.length > 0) {
        const burnList = burns.map(b => {
          const mat = b.material || '';
          const amt = b.amount != null ? b.amount : '';
          const matLabel = inferMaterialLabel({ material: mat }, decoded) || mat;
          return `${matLabel} ${amt}`;
        }).join(', ');
        parts.push(`Burn: ${burnList}`);
      }

      if (Array.isArray(claims) && claims.length > 0) {
        const claimList = claims.map(c => {
          const mat = c.material || c.item || '';
          const amt = c.amount != null ? c.amount : '';
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

// Helper to update progress message
export function updateProgress(message: string): void {
  const resultsDiv = document.getElementById('results') as HTMLElement | null;
  if (resultsDiv) {
    let elapsed = '';
    if (analysisStartTime) {
      const seconds = Math.floor((Date.now() - analysisStartTime) / 1000);
      elapsed = ` - ${seconds}s`;
    }
    resultsDiv.innerHTML = `<div class="loading">Processing transaction data, this may take up to 5 minutes depending on your tx/day...<br><span style="font-size:11px; color:#7a8ba0; margin-top:8px; display:block;">(${message}${elapsed})</span></div>`;
  }
}

// Global helper to format timestamps used across the UI
export function formatTimestamp(ts: number | string | Date | null | undefined): string {
  if (!ts) return '';
  // If numeric blockTime in seconds
  if (typeof ts === 'number') {
    try { return new Date(ts * 1000).toLocaleString(); } catch (e) { return String(ts); }
  }
  // If ISO string or numeric string
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      try { return new Date(Number(ts) * 1000).toLocaleString(); } catch (e) { return ts; }
    }
    try { const d = new Date(ts); return isNaN(d.getTime()) ? ts : d.toLocaleString(); } catch (_) { return ts; }
  }
  return '';
}

// Tabs handling
export function showFees(): void {
  const fees = document.getElementById('fees-view') as HTMLElement | null;
  const tabFees = document.getElementById('tab-fees') as HTMLElement | null;
  if (fees) fees.style.display = '';
  if (tabFees) tabFees.classList.add('tab-active');
}

export function toggleFleet(fleetId: string): void {
  const fleetEl = document.getElementById(fleetId) as HTMLElement | null;
  if (fleetEl && fleetEl.parentElement) {
    fleetEl.parentElement.classList.toggle('expanded');
  }
}

// Esportare funzioni necessarie ad altri moduli