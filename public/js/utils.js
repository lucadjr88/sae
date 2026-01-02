
// Copy to clipboard helper with visual feedback
export function copyToClipboard(text, event) {
	navigator.clipboard.writeText(text).then(() => {
		// Show tooltip feedback
		const btn = event.target.closest('[data-copy]');
		if (btn) {
			const originalText = btn.textContent;
			btn.textContent = '✓ Copied!';
			btn.style.color = '#10b981';
			setTimeout(() => {
				btn.textContent = originalText;
				btn.style.color = '';
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
export function inferRecipeName(decoded, burns, claims) {
	// Prefer claimed items (produced outputs)
	try {
		const c = claims && claims.length ? claims[0] : null;
		const mat = c && (c.material || c.item);
		if (mat) return mat.toString();
	} catch {}
	// Then explicit recipeName provided by decoder
	try {
		if (decoded && decoded.recipeName) return decoded.recipeName.toString();
		const action0 = decoded && decoded.actions && decoded.actions[0];
		if (action0 && action0.recipeName) return action0.recipeName.toString();
		if (decoded && decoded.recipe) return decoded.recipe.toString();
	} catch {}
	// If nothing reliable, return null to avoid using burned material as name
	return null;
}

// Infer a human-friendly crafting material label from various fields
export function inferMaterialLabel(entry, decoded) {
	const preferred = (entry && (entry.material || entry.recipe || entry.decodedMaterial)) || '';
	const norm = (preferred || '').toString().trim().toLowerCase();
	const candidates = new Set();
	if (norm) candidates.add(norm);
	// From decoded actions claimed items (what is produced) - prioritize over burned materials
	try {
				const claims = (decoded && (decoded.claimedItems || (decoded.actions && decoded.actions[0] && decoded.actions[0].claimedItems))) || [];
				claims.forEach(c => {
					const m = (c && (c.material || c.item)) ? (c.material || c.item).toString().toLowerCase() : '';
					if (m) candidates.add(m);
				});
			} catch {}
  
			// From decoded actions burned materials
			try {
		const burns = (decoded && (decoded.burnedMaterials || (decoded.actions && decoded.actions[0] && decoded.actions[0].burnedMaterials))) || [];
		burns.forEach(b => {
			const m = (b && b.material) ? b.material.toString().toLowerCase() : '';
			if (m) candidates.add(m);
		});
	} catch {}
	// From decoded recipe name
	try {
		const recipeName = decoded && (decoded.recipeName || decoded.material || decoded.recipe);
		if (recipeName) candidates.add(recipeName.toString().toLowerCase());
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
	for (const c of candidates) {
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
export function normalizeOpName(opName) {
  const mapping = {
    'IdleToLoadingBay': 'Dock/Undock/Load/Unload',
    'Cargo': 'Dock/Undock/Load/Unload',
    'LoadingBayToIdle': 'Dock/Undock/Load/Unload',
	'DepositCargoToFleet': 'Dock/Undock/Load/Unload',
	'WithdrawCargoFromFleet': 'Dock/Undock/Load/Unload',
    'StartMiningAsteroid': 'Mining',
    'CreateCraftingProcess': 'Crafting',
    'BurnCraftingConsumables': 'Crafting',
	'StartSubwarp': 'Subwarp',
    'FleetStateHandler_subwarp': 'Subwarp',
    'FleetStateHandler_mining': 'Mining',
    'FleetStateHandler_loading_bay': 'Dock/Undock/Load/Unload'
  };
  return mapping[opName] || opName;
}
