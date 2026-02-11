
// Copy to clipboard helper with visual feedback
import { DecodedInstruction, BurnedMaterial, ClaimedItem, MaterialEntry } from '../types/common';
export function copyToClipboard(text: string, event: MouseEvent | KeyboardEvent): void {
	navigator.clipboard.writeText(text).then(() => {
		// Show tooltip feedback
		const btn = (event.target as Element).closest('[data-copy]');
		if (btn) {
			const originalText = (btn as HTMLElement).textContent;
			(btn as HTMLElement).textContent = '✓ Copied!';
			(btn as HTMLElement).style.color = '#10b981';
			setTimeout(() => {
				(btn as HTMLElement).textContent = originalText;
				(btn as HTMLElement).style.color = '';
			}, 1500);
		}
	}).catch(err => {
		console.error('Failed to copy:', err);
		alert('Failed to copy to clipboard');
	});
	event.stopPropagation();
	event.preventDefault();
}

// Derive a product/recipe name for crafting without falling back to burned materials
export function inferRecipeName(decoded: DecodedInstruction | null, burns: BurnedMaterial[], claims: ClaimedItem[]): string | null {
	// Prefer claimed items (produced outputs)
	try {
		const c = claims && claims.length > 0 ? claims[0] : null;
		const mat = c?.material || c?.item;
		if (mat) return String(mat);
	} catch {}
	// Then explicit recipeName provided by decoder
	try {
		if (decoded?.recipeName) return String(decoded.recipeName);
		const action0 = decoded?.actions?.[0];
		if (action0?.recipeName) return String(action0.recipeName);
		if (decoded?.recipe) return String(decoded.recipe);
	} catch {}
	// If nothing reliable, return null to avoid using burned material as name
	return null;
}

// Infer a human-friendly crafting material label from various fields
export function inferMaterialLabel(entry: MaterialEntry | null, decoded: DecodedInstruction | null): string {
	const preferred = entry?.material || entry?.recipe || entry?.decodedMaterial || '';
	const norm = preferred.toString().trim().toLowerCase();
	const candidates = new Set<string>();
	if (norm) candidates.add(norm);
	// From decoded actions claimed items (what is produced) - prioritize over burned materials
	try {
		const claims = decoded?.claimedItems || decoded?.actions?.[0]?.claimedItems || [];
		claims.forEach((c: any) => {
			const m = c?.material || c?.item;
			if (m) candidates.add(String(m).toLowerCase());
		});
	} catch {}

	// From decoded actions burned materials
	try {
		const burns = decoded?.burnedMaterials || decoded?.actions?.[0]?.burnedMaterials || [];
		burns.forEach((b: any) => {
			const m = b?.material;
			if (m) candidates.add(String(m).toLowerCase());
		});
	} catch {}
	// From decoded recipe name
	try {
		const recipeName = decoded?.recipeName || decoded?.material || decoded?.recipe;
		if (recipeName) candidates.add(String(recipeName).toLowerCase());
	} catch {}
	// Keyword mapping
	const map = [
		['ammo', 'Ammo'],
		['fuel', 'Fuel'],
		['food', 'Food'],
		['ore', 'Ore'],
		['tool', 'Tool'],
		['component', 'Component'],
		['metal', 'Metal'],
		['fiber', 'Fiber'],
		['chemical', 'Chemical'],
		['circuit', 'Circuit']
	];
	for (const c of Array.from(candidates)) {
		for (const [k, v] of map) {
			if (c.includes(k)) return v;
		}
	}
	// Fallback: capitalize preferred if present
	if (preferred) return preferred.toString().charAt(0).toUpperCase() + preferred.toString().slice(1);
	return '';
}

/**
 * Normalizes operation names for frontend display.
 * Regroups multiple technical operation names into human-friendly categories.
 */
export function normalizeOpName(opName: string): string {
	const lower = (opName || '').toLowerCase();
	if (!lower) return opName;

    // Check substrings in lowercase composite names
	if (lower.includes('createstarbaseupgrade') || lower.includes('submitstarbaseupgrade')) return 'SB Upgrade';

	if (lower.includes('closetokenaccount') || lower.includes('opentokenaccount')) return 'TokenAccount';
    if (lower.includes('loading_bay') || lower.includes('loadingbay') || lower.includes('withdrawcargo') || lower.includes('depositcargo')) return 'Dock/Undock/Load/Unload';
    if (lower.includes('mineasteroid') || lower.includes('startminingasteroid') || lower.includes('stopminingasteroid')) return 'Mining';
    if (lower.includes('subwarp') || lower.includes('startsubwarp') || lower.includes('stopsubwarp')) return 'Subwarp';
    if (lower.includes('scanforsurveydataunits')) return 'Scan SDU';
    if (lower.includes('crafting')) return 'Crafting';
    if (lower.includes('warp')) return 'Warp';

	const mapping: Record<string, string> = {
		//'startminingasteroid': 'Mining',
	};
	return mapping[lower] || opName;
}

// Type guard functions
function isDecodedInstruction(obj: any): obj is DecodedInstruction {
  return obj && typeof obj === 'object' && ('recipeName' in obj || 'actions' in obj);
}

function isValidMaterialEntry(obj: any): obj is MaterialEntry {
  return obj && typeof obj === 'object' && ('material' in obj || 'recipe' in obj || 'decodedMaterial' in obj);
}

