// Crafting type formatting
export function formatCraftingType(d: any): string {
  const action = d && (d.action || d.type);
  if (action) {
    const al = action.toString().toLowerCase();
    if (al.includes('crafting_claim') || al.includes('claim')) return 'Claim Crafting';
    if (al.includes('crafting_start') || al.includes('start')) return 'Start Crafting';
  }
  const t = (d && (d.displayType || d.decodedKind || d.type)) || '';
  const tl = t.toString().toLowerCase();
  if (tl.includes('claim')) return 'Claim Crafting';
  if (tl.includes('burn') || tl.includes('consumable')) return 'Start Crafting';
  if (tl.includes('recipe')) return 'Crafting Recipe';
  if (tl.includes('process')) return 'Start Crafting';
  return action || t || 'Crafting';
}

