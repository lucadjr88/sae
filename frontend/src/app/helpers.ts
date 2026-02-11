
// Helper functions extracted from app.js

import { inferMaterialLabel } from '@utils/utils';
import type { DecodedGeneric } from '../types/details';

interface BurnedMaterial {
  material?: string;
  amount?: number | null;
}

interface ClaimedItem {
  material?: string;
  item?: string;
  amount?: number | null;
}

interface Action {
  action?: string;
  burnedMaterials?: BurnedMaterial[];
  claimedItems?: ClaimedItem[];
}

export function updateDetailCell(cellId: string, decoded: DecodedGeneric): void {
  const cell = document.getElementById(cellId);
  if (!cell) return;

  let detailsHtml = '';
  try {
    const action: Action | undefined = (decoded.actions && decoded.actions[0]) || {};
    const burns: BurnedMaterial[] = decoded.burnedMaterials || action?.burnedMaterials || [];
    const claims: ClaimedItem[] = decoded.claimedItems || action?.claimedItems || [];
    const actionStr: string = (action && action.action) ? action.action.toString().toLowerCase() : '';
    let craftingStage: string = 'Crafting';
    if (actionStr.includes('claim')) craftingStage = 'Claim Crafting';
    else if (actionStr.includes('start')) craftingStage = 'Start Crafting';
    else if (claims && claims.length > 0) craftingStage = 'Claim Crafting';
    else if (burns && burns.length > 0) craftingStage = 'Start Crafting';
    const parts: string[] = [];
    parts.push(craftingStage);
    if (Array.isArray(burns) && burns.length > 0) {
      const burnList: string = burns.map((b: BurnedMaterial) => {
        const mat: string = b.material || '';
        const amt: string = b.amount !== null ? String(b.amount) : '';
        const matLabel: string = inferMaterialLabel({ material: mat }, decoded) || mat;
        return `${matLabel} ${amt}`;
      }).join(', ');
      parts.push(`Burn: ${burnList}`);
    }
    if (Array.isArray(claims) && claims.length > 0) {
      const claimList: string = claims.map((c: ClaimedItem) => {
        const mat: string = c.material || c.item || '';
        const amt: string = c.amount !== null ? String(c.amount) : '';
        const matLabel: string = inferMaterialLabel({ material: mat }, decoded) || mat;
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

export function updateAllDetailCells(cells: HTMLElement[], values: DecodedGeneric[]): void {
  cells.forEach((cell: HTMLElement, i: number) => {
    let detailsHtml = '';
    try {
      const decoded: DecodedGeneric = values[i];
      const action: Action | undefined = (decoded.actions && decoded.actions[0]) || {};
      const burns: BurnedMaterial[] = decoded.burnedMaterials || action?.burnedMaterials || [];
      const claims: ClaimedItem[] = decoded.claimedItems || action?.claimedItems || [];
      const actionStr: string = (action && action.action) ? action.action.toString().toLowerCase() : '';
      let craftingStage: string = 'Crafting';
      if (actionStr.includes('claim')) craftingStage = 'Claim Crafting';
      else if (actionStr.includes('start')) craftingStage = 'Start Crafting';
      else if (claims && claims.length > 0) craftingStage = 'Claim Crafting';
      else if (burns && burns.length > 0) craftingStage = 'Start Crafting';
      const parts: string[] = [];
      parts.push(craftingStage);
      if (Array.isArray(burns) && burns.length > 0) {
        const burnList: string = burns.map((b: BurnedMaterial) => {
          const mat: string = b.material || '';
          const amt: string = b.amount !== null ? String(b.amount) : '';
          const matLabel: string = inferMaterialLabel({ material: mat }, decoded) || mat;
          return `${matLabel} ${amt}`;
        }).join(', ');
        parts.push(`Burn: ${burnList}`);
      }
      if (Array.isArray(claims) && claims.length > 0) {
        const claimList: string = claims.map((c: ClaimedItem) => {
          const mat: string = c.material || c.item || '';
          const amt: string = c.amount !== null ? String(c.amount) : '';
          const matLabel: string = inferMaterialLabel({ material: mat }, decoded) || mat;
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

export function formatTimestamp(ts: number | string | null | undefined): string {
  if (!ts) return '';
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

